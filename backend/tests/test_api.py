import os
import tempfile
from pathlib import Path
import pytest

# Usar una base de datos SQLite temporal limpia para las pruebas
_tmp_dir = tempfile.mkdtemp(prefix="anden_test_")
os.environ["ANDEN_DB_URL"] = f"sqlite:///{Path(_tmp_dir, 'test_anden.db').as_posix()}"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _auth_headers(client: TestClient, username: str, password: str = "1234") -> dict:
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_and_seed(client: TestClient):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    h_diego = _auth_headers(client, "diego")
    cursos = client.get("/api/cursos", headers=h_diego).json()
    assert len(cursos) == 6
    # 3 gratis y 3 restringidos
    gratis = [c for c in cursos if c["tipoAcceso"] == "gratis"]
    restringidos = [c for c in cursos if c["tipoAcceso"] == "restringido"]
    assert len(gratis) == 3
    assert len(restringidos) == 3

    # Curso 5 tiene prelación opcional sobre Curso 4
    c5 = next(c for c in cursos if c["id"] == 5)
    assert c5["prerequisitoCursoId"] == 4
    assert c5["prelacionCumplida"] is False

    # Diego arranca con su certificado automático de PHP desde cero (curso 2) y logros dinámicos
    prog = client.get("/api/progreso", headers=h_diego).json()
    assert prog["resumen"]["nivel"] == 8
    assert prog["resumen"]["diasSeguidos"] == 12
    assert len(prog["habilidades"]) >= 3
    assert any(l["codigo"] == "fin_de_linea" and l["desbloqueado"] for l in prog["logros"])
    assert any(cert["cursoId"] == 2 for cert in prog["certificados"])


def test_registro_estudiante_y_jerarquia_roles(client: TestClient):
    # Auto-registro siempre crea estudiante
    r = client.post(
        "/api/auth/register",
        json={
            "username": "camila_test",
            "nombre": "Camila González",
            "email": "camila@test.edu",
            "password": "clave123",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["usuario"]["rol"] == "estudiante"
    h_est = {"Authorization": f"Bearer {data['token']}"}

    # Estudiante no puede crear cursos ni usuarios
    assert client.post("/api/admin/usuarios", headers=h_est, json={
        "username": "hack", "nombre": "Hack", "password": "1234", "rol": "profesor"
    }).status_code == 403

    # Profesor NO puede crear otro profesor (solo admin_general)
    h_profe = _auth_headers(client, "profe")
    assert client.post("/api/admin/usuarios", headers=h_profe, json={
        "username": "otro_profe", "nombre": "Otro Profe", "password": "1234", "rol": "profesor"
    }).status_code == 403

    # Admin general SÍ puede crear un profesor
    h_admin = _auth_headers(client, "admin")
    r_new_p = client.post("/api/admin/usuarios", headers=h_admin, json={
        "username": "profe_nuevo", "nombre": "Prof. Misael", "password": "1234", "rol": "profesor"
    })
    assert r_new_p.status_code == 201
    assert r_new_p.json()["usuario"]["rol"] == "profesor"


def test_acceso_restringido_solicitud_y_pago_simulado_y_prelacion(client: TestClient):
    h_est = _auth_headers(client, "camila_test", "clave123")
    h_profe = _auth_headers(client, "profe")

    # Curso 3 (restringido) está bloqueado para nueva estudiante
    cursos = client.get("/api/cursos", headers=h_est).json()
    c3 = next(c for c in cursos if c["id"] == 3)
    assert c3["tieneAcceso"] is False
    assert c3["estadoAcceso"] == "bloqueado"

    # Intentar guardar avance sin acceso da 403
    r_block = client.post("/api/progreso/avance", headers=h_est, json={"cursoId": 3, "leccionId": 301, "segundo": 10})
    assert r_block.status_code == 403

    # Opción 1: Solicitar acceso al profesor -> profesor aprueba
    r_sol = client.post("/api/cursos/3/solicitar-acceso", headers=h_est, json={"mensaje": "Hola profe, deseo inscribirme"})
    assert r_sol.status_code == 200
    assert r_sol.json()["estado"] == "pendiente"

    sols = client.get("/api/admin/solicitudes", headers=h_profe).json()
    sol_camila = next(s for s in sols if s["estudianteUsername"] == "camila_test" and s["cursoId"] == 3)
    r_ap = client.put(f"/api/admin/solicitudes/{sol_camila['id']}", headers=h_profe, json={"estado": "aprobado"})
    assert r_ap.status_code == 200

    cursos2 = client.get("/api/cursos", headers=h_est).json()
    assert next(c for c in cursos2 if c["id"] == 3)["tieneAcceso"] is True

    # Opción 2: Pago simulado para Curso 4 -> acceso inmediato
    r_pago = client.post("/api/cursos/4/pagar-simulado", headers=h_est, json={"metodoPago": "Pago Móvil demo", "titular": "Camila"})
    assert r_pago.status_code == 200
    assert r_pago.json()["estado"] == "aprobado"
    assert r_pago.json()["referencia"].startswith("SIM-")

    # Pago simulado para Curso 5, PERO sigue bloqueado por prelación (no terminó Curso 4)
    r_pago5 = client.post("/api/cursos/5/pagar-simulado", headers=h_est, json={"metodoPago": "Tarjeta demo"})
    assert r_pago5.status_code == 200
    r_pre = client.post("/api/progreso/avance", headers=h_est, json={"cursoId": 5, "leccionId": 501, "segundo": 5})
    assert r_pre.status_code == 403
    assert "prerrequisito" in r_pre.json()["detail"].lower()


def test_cinco_tipos_preguntas_logros_y_certificado(client: TestClient):
    h_est = _auth_headers(client, "camila_test", "clave123")
    cursos = client.get("/api/cursos", headers=h_est).json()
    c1 = next(c for c in cursos if c["id"] == 1)
    l102 = next(l for m in c1["modulos"] for l in m["lecciones"] if l["id"] == 102)
    l103 = next(l for m in c1["modulos"] for l in m["lecciones"] if l["id"] == 103)

    # 1. Opción única (l102[0])
    q_unica = next(q for q in l102["cuestionarios"] if q["tipo"] == "opcion_unica")
    r_bad = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_unica["id"], "respuesta": 0, "intento": 1})
    assert r_bad.json()["correcta"] is False
    r_ok = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_unica["id"], "respuesta": 1, "intento": 2})
    assert r_ok.json()["correcta"] is True
    assert r_ok.json()["xpGanado"] == 5

    # 2. Verdadero/Falso
    q_vf = next(q for q in l102["cuestionarios"] if q["tipo"] == "verdadero_falso")
    r_vf = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_vf["id"], "respuesta": 0, "intento": 1})
    assert r_vf.json()["correcta"] is True
    assert r_vf.json()["xpGanado"] == 20

    # 3. Completación (insensible a mayúsculas/espacios)
    q_comp = next(q for q in l102["cuestionarios"] if q["tipo"] == "completacion")
    r_comp_bad = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_comp["id"], "respuesta": "class", "intento": 1})
    assert r_comp_bad.json()["correcta"] is False
    r_comp_ok = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_comp["id"], "respuesta": "  CLASSNAME ", "intento": 2})
    assert r_comp_ok.json()["correcta"] is True

    # 4. Múltiple respuesta
    q_mult = next(q for q in l103["cuestionarios"] if q["tipo"] == "multiple_respuesta")
    r_m_bad = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_mult["id"], "respuesta": [0], "intento": 1})
    assert r_m_bad.json()["correcta"] is False
    r_m_ok = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_mult["id"], "respuesta": [0, 1, 3], "intento": 2})
    assert r_m_ok.json()["correcta"] is True

    # 5. Desarrollo con auto-evaluación básica
    q_des = next(q for q in l103["cuestionarios"] if q["tipo"] == "desarrollo")
    r_d_short = client.post("/api/progreso/responder", headers=h_est, json={"preguntaId": q_des["id"], "respuesta": "muy corta", "intento": 1})
    assert r_d_short.json()["correcta"] is False
    r_d_ok = client.post(
        "/api/progreso/responder",
        headers=h_est,
        json={
            "preguntaId": q_des["id"],
            "respuesta": "Las props pasan datos desde el componente padre y son de solo lectura, mientras que el estado cambia con las acciones del usuario.",
            "intento": 1,
        },
    )
    assert r_d_ok.json()["correcta"] is True
    assert r_d_ok.json()["puntaje"] >= 0.75

    # Completar lección 101 desbloquea logro dinámico 'primer_paso' y suma días seguidos = 1
    r_cl = client.post("/api/progreso/completar-leccion", headers=h_est, json={"cursoId": 1, "leccionId": 101})
    assert r_cl.status_code == 200
    prog = r_cl.json()["progreso"]
    assert prog["resumen"]["diasSeguidos"] == 1
    assert any(l["codigo"] == "primer_paso" and l["desbloqueado"] for l in prog["logros"])

    # Verificar certificado público de Diego (curso 2)
    h_diego = _auth_headers(client, "diego")
    cert = client.get("/api/certificados/curso/2", headers=h_diego).json()
    assert cert["porcentajeAciertos"] >= 70
    verif = client.get(f"/api/certificados/verificar/{cert['codigo']}").json()
    assert verif["valido"] is True
    assert verif["estudianteNombre"] == "Diego Cardozo"


def test_subida_video_y_range_streaming_y_validacion_checkpoint(client: TestClient):
    h_profe = _auth_headers(client, "profe")
    fake_mp4 = b"\x00\x00\x00\x18ftypmp42" + b"A" * 2048
    r_up = client.post("/api/videos/upload", headers=h_profe, files={"file": ("demo.mp4", fake_mp4, "video/mp4")})
    assert r_up.status_code == 200, r_up.text
    video_url = r_up.json()["videoUrl"]
    assert video_url.startswith("/uploads/videos/")

    # Range request devuelve 206 Partial Content
    r_range = client.get(video_url, headers={"Range": "bytes=0-15"})
    assert r_range.status_code == 206
    assert len(r_range.content) == 16

    # Limpiar archivo temporal de prueba para no ensuciar uploads/videos
    from app.database import UPLOADS_DIR
    (UPLOADS_DIR / Path(video_url).name).unlink(missing_ok=True)

    # Checkpoint fuera de la duración del video falla con 400
    r_bad_cp = client.put(
        "/api/lecciones/101",
        headers=h_profe,
        json={
            "duracion": 30,
            "cuestionarios": [
                {"segundo": 45, "tipo": "verdadero_falso", "pregunta": "¿Pasa el límite?", "correcta": 0}
            ],
        },
    )
    assert r_bad_cp.status_code == 400


def test_crud_curso_con_prelacion_y_repaso_mejora_puntaje(client: TestClient):
    h_profe = _auth_headers(client, "profe")
    r_new = client.post(
        "/api/cursos",
        headers=h_profe,
        json={
            "titulo": "Seguridad Web",
            "categoria": "Seguridad",
            "nivel": "Intermedio",
            "descripcion": "Fundamentos OWASP y protección de aplicaciones.",
            "color": "#e06d53",
            "tipoAcceso": "restringido",
            "precio": 12.5,
            "umbralCertificado": 80,
            "prerequisitoCursoId": 1,
            "modulos": [
                {
                    "titulo": "Módulo 1",
                    "lecciones": [
                        {"titulo": "XSS y CSRF", "duracion": 45, "video": "/videos/101.mp4", "cuestionarios": []}
                    ],
                }
            ],
        },
    )
    assert r_new.status_code == 201, r_new.text
    nuevo_id = r_new.json()["id"]
    assert r_new.json()["prerequisitoCursoId"] == 1
    assert r_new.json()["umbralCertificado"] == 80

    # Eliminar curso de prueba
    r_del = client.delete(f"/api/cursos/{nuevo_id}", headers=h_profe)
    assert r_del.status_code == 200

    # Modo repaso mejora puntaje sin duplicar XP
    h_est = _auth_headers(client, "camila_test", "clave123")
    prog_antes = client.get("/api/progreso", headers=h_est).json()
    xp_antes = prog_antes["xp"]
    cursos = client.get("/api/cursos", headers=h_est).json()
    c1 = next(c for c in cursos if c["id"] == 1)
    l102 = next(l for m in c1["modulos"] for l in m["lecciones"] if l["id"] == 102)
    q_unica = next(q for q in l102["cuestionarios"] if q["tipo"] == "opcion_unica")
    # Había acertado en intento 2 (0.65); ahora acierta en intento 1 en modoRepaso -> sube a 1.0 sin duplicar XP
    r_rep = client.post(
        "/api/progreso/responder",
        headers=h_est,
        json={"preguntaId": q_unica["id"], "respuesta": 1, "intento": 1, "modoRepaso": True},
    )
    assert r_rep.status_code == 200
    assert r_rep.json()["xpGanado"] == 0
    assert r_rep.json()["progreso"]["xp"] == xp_antes
    assert r_rep.json()["progreso"]["respuestas"][str(q_unica["id"])]["puntaje"] == 1.0


def test_aislamiento_entre_profesores_y_admin_general(client: TestClient):
    h_admin = _auth_headers(client, "admin")
    h_profe1 = _auth_headers(client, "profe")

    # Admin general crea un segundo profesor
    r_p2 = client.post(
        "/api/admin/usuarios",
        headers=h_admin,
        json={
            "username": "profe_dos",
            "nombre": "Prof. Segundo",
            "password": "1234",
            "rol": "profesor",
        },
    )
    assert r_p2.status_code == 201, r_p2.text
    h_profe2 = _auth_headers(client, "profe_dos")

    # profe_dos crea su propio curso restringido
    r_curso = client.post(
        "/api/cursos",
        headers=h_profe2,
        json={
            "titulo": "Curso Exclusivo Profe 2",
            "categoria": "Programación",
            "nivel": "Intermedio",
            "descripcion": "Curso creado únicamente por el profesor 2.",
            "color": "#2563eb",
            "tipoAcceso": "restringido",
            "precio": 10.0,
            "modulos": [
                {
                    "titulo": "Módulo 1",
                    "lecciones": [{"titulo": "Tema inicial", "video": "/videos/101.mp4"}],
                }
            ],
        },
    )
    assert r_curso.status_code == 201, r_curso.text
    curso_p2_id = r_curso.json()["id"]
    leccion_p2_id = r_curso.json()["modulos"][0]["lecciones"][0]["id"]
    assert r_curso.json()["puedeEditar"] is True

    # Para profe1, ese curso debe aparecer como puedeEditar=False
    cursos_p1 = client.get("/api/cursos", headers=h_profe1).json()
    c_visto_p1 = next(c for c in cursos_p1 if c["id"] == curso_p2_id)
    assert c_visto_p1["puedeEditar"] is False

    # profe1 NO puede editar, agregar lección, editar video ni eliminar el curso de profe_dos (403)
    assert client.put(
        f"/api/cursos/{curso_p2_id}",
        headers=h_profe1,
        json={
            "titulo": "Intento hack",
            "categoria": "Programación",
            "nivel": "Intermedio",
            "descripcion": "No debería dejar",
            "color": "#2563eb",
            "tipoAcceso": "gratis",
            "modulos": [],
        },
    ).status_code == 403
    assert client.put(
        f"/api/lecciones/{leccion_p2_id}",
        headers=h_profe1,
        json={"duracion": 45, "cuestionarios": []},
    ).status_code == 403
    assert client.delete(f"/api/cursos/{curso_p2_id}", headers=h_profe1).status_code == 403

    # profe_dos SÍ puede editar su propio curso, y admin_general puede eliminarlo al final
    assert client.put(
        f"/api/lecciones/{leccion_p2_id}",
        headers=h_profe2,
        json={"duracion": 45, "cuestionarios": []},
    ).status_code == 200
    assert client.delete(f"/api/cursos/{curso_p2_id}", headers=h_admin).status_code == 200


def test_duracion_real_automatica_no_trunca_progreso(client: TestClient):
    h_profe = _auth_headers(client, "profe")
    h_est = _auth_headers(client, "camila_test", "clave123")

    # Crear curso sin enviar duración manual (backend asigna default y luego sincroniza con duracionReal)
    r_curso = client.post(
        "/api/cursos",
        headers=h_profe,
        json={
            "titulo": "Curso Duracion Auto",
            "categoria": "Datos",
            "nivel": "Principiante",
            "descripcion": "Verifica que la duración real del video mande siempre.",
            "color": "#2f6f73",
            "tipoAcceso": "gratis",
            "modulos": [
                {
                    "titulo": "Módulo 1",
                    "lecciones": [
                        {"titulo": "Lección larga", "duracion": 10, "video": "/videos/101.mp4"},
                        {"titulo": "Lección siguiente", "video": "/videos/102.mp4"},
                    ],
                }
            ],
        },
    )
    assert r_curso.status_code == 201, r_curso.text
    cid = r_curso.json()["id"]
    lid1 = r_curso.json()["modulos"][0]["lecciones"][0]["id"]

    # El video real dura 45s y el estudiante ya va por el segundo 35: NO debe truncarse en 10s
    r_av = client.post(
        "/api/progreso/avance",
        headers=h_est,
        json={"cursoId": cid, "leccionId": lid1, "segundo": 35, "duracionReal": 45},
    )
    assert r_av.status_code == 200
    assert r_av.json()["lecciones"][str(lid1)]["maximo"] == 35

    # Y la lección en SQLite debe haberse sincronizado a 45s
    cursos_after = client.get("/api/cursos", headers=h_est).json()
    c_after = next(c for c in cursos_after if c["id"] == cid)
    assert c_after["modulos"][0]["lecciones"][0]["duracion"] == 45

    # Completar lección 1 marca completada=True y un avance tardío nunca la revierte a False
    r_comp = client.post(
        "/api/progreso/completar-leccion",
        headers=h_est,
        json={"cursoId": cid, "leccionId": lid1, "duracionReal": 45},
    )
    assert r_comp.status_code == 200
    assert r_comp.json()["progreso"]["lecciones"][str(lid1)]["completada"] is True

    r_late = client.post(
        "/api/progreso/avance",
        headers=h_est,
        json={"cursoId": cid, "leccionId": lid1, "segundo": 44, "duracionReal": 45},
    )
    assert r_late.status_code == 200
    assert r_late.json()["lecciones"][str(lid1)]["completada"] is True

    # Limpieza
    assert client.delete(f"/api/cursos/{cid}", headers=h_profe).status_code == 200


def test_sistema_valoracion_videos_cursos_y_profesor(client: TestClient):
    h_profe = _auth_headers(client, "profe")
    h_diego = _auth_headers(client, "diego")
    h_camila = _auth_headers(client, "camila_test", "clave123")

    # Profe crea un curso propio con 2 videos (lecciones) y otro curso con 1 video
    r_c1 = client.post(
        "/api/cursos",
        headers=h_profe,
        json={
            "titulo": "Curso Valoración A",
            "categoria": "Diseño",
            "nivel": "Principiante",
            "descripcion": "Curso de prueba para valoraciones.",
            "color": "#2f6f73",
            "tipoAcceso": "gratis",
            "precio": 0,
            "umbralCertificado": 70,
            "modulos": [
                {
                    "titulo": "Módulo 1",
                    "lecciones": [
                        {"titulo": "Video 1", "duracion": 60, "video": "/videos/101.mp4", "cuestionarios": []},
                        {"titulo": "Video 2", "duracion": 60, "video": "/videos/102.mp4", "cuestionarios": []},
                    ],
                }
            ],
        },
    )
    assert r_c1.status_code == 201, r_c1.text
    c1 = r_c1.json()
    vid1 = c1["modulos"][0]["lecciones"][0]["id"]
    vid2 = c1["modulos"][0]["lecciones"][1]["id"]

    r_c2 = client.post(
        "/api/cursos",
        headers=h_profe,
        json={
            "titulo": "Curso Valoración B",
            "categoria": "Datos",
            "nivel": "Intermedio",
            "descripcion": "Segundo curso para validar promedio docente.",
            "color": "#e59b34",
            "tipoAcceso": "gratis",
            "precio": 0,
            "umbralCertificado": 70,
            "modulos": [
                {
                    "titulo": "Módulo 1",
                    "lecciones": [
                        {"titulo": "Video 3", "duracion": 60, "video": "/videos/101.mp4", "cuestionarios": []},
                    ],
                }
            ],
        },
    )
    assert r_c2.status_code == 201, r_c2.text
    c2 = r_c2.json()
    vid3 = c2["modulos"][0]["lecciones"][0]["id"]

    # Validación de rango 1..5
    assert client.post(f"/api/lecciones/{vid1}/valorar", headers=h_diego, json={"puntuacion": 0}).status_code == 422
    assert client.post(f"/api/lecciones/{vid1}/valorar", headers=h_diego, json={"puntuacion": 6}).status_code == 422

    # Diego y Camila valoran vid1: promedio vid1 = (5 + 3) / 2 = 4.0
    r_v1_d = client.post(f"/api/lecciones/{vid1}/valorar", headers=h_diego, json={"puntuacion": 5})
    assert r_v1_d.status_code == 200
    assert r_v1_d.json()["leccion"]["miValoracion"] == 5

    r_v1_c = client.post(f"/api/lecciones/{vid1}/valorar", headers=h_camila, json={"puntuacion": 3})
    assert r_v1_c.status_code == 200
    assert r_v1_c.json()["leccion"]["valoracionPromedio"] == 4.0
    assert r_v1_c.json()["leccion"]["totalValoraciones"] == 2

    # Diego actualiza su valoración de vid1 de 5 a 5 (sin duplicar registro) y valora vid2 con 2 y vid3 con 3
    r_upd = client.post(f"/api/lecciones/{vid1}/valorar", headers=h_diego, json={"puntuacion": 5})
    assert r_upd.json()["leccion"]["totalValoraciones"] == 2

    client.post(f"/api/lecciones/{vid2}/valorar", headers=h_diego, json={"puntuacion": 2})
    client.post(f"/api/lecciones/{vid3}/valorar", headers=h_camila, json={"puntuacion": 3})

    # Ver valoración individual de cada curso en /api/cursos:
    # c1 tiene vid1=4.0 y vid2=2.0 -> promedio curso = (4.0 + 2.0) / 2 = 3.0
    # c2 tiene vid3=3.0 -> promedio curso = 3.0
    cursos_diego = client.get("/api/cursos", headers=h_diego).json()
    curso_1 = next(c for c in cursos_diego if c["id"] == c1["id"])
    curso_2 = next(c for c in cursos_diego if c["id"] == c2["id"])
    assert curso_1["valoracionPromedio"] == 3.0
    assert curso_1["totalValoraciones"] == 3
    assert curso_2["valoracionPromedio"] == 3.0
    assert curso_2["totalValoraciones"] == 1

    # Verificar promedio del profesor calculado con el promedio de todos sus videos valorados:
    # vid1=4.0, vid2=2.0, vid3=3.0 -> promedio = (4.0 + 2.0 + 3.0) / 3 = 3.0
    r_doc = client.get("/api/docente/valoracion", headers=h_profe)
    assert r_doc.status_code == 200
    doc = r_doc.json()
    assert doc["promedio"] == 3.0
    assert doc["videosValorados"] == 3
    assert doc["totalValoraciones"] == 4

    # /api/auth/me del profesor también incluye valoracionDocente
    me_profe = client.get("/api/auth/me", headers=h_profe).json()
    assert me_profe["usuario"]["valoracionDocente"]["promedio"] == 3.0

    # Limpieza
    assert client.delete(f"/api/cursos/{c1['id']}", headers=h_profe).status_code == 200
    assert client.delete(f"/api/cursos/{c2['id']}", headers=h_profe).status_code == 200
