from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import re
import uuid
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session, selectinload

from .database import Base, SessionLocal, UPLOADS_DIR, engine, get_db
from .evaluacion import evaluar_respuesta, serializar_pregunta
from .gamificacion import (
    XP_CURSO,
    XP_LECCION,
    asegurar_progreso_usuario,
    calcular_estadisticas_curso,
    construir_estado_progreso,
    formatear_fecha_es,
    registrar_actividad_hoy,
    verificar_y_emitir_certificado,
    xp_por_respuesta,
)
from .models import (
    ActividadDiaria,
    Certificado,
    Curso,
    InscripcionAcceso,
    Leccion,
    LogroUsuario,
    Modulo,
    Pregunta,
    ProgresoLeccion,
    ProgresoUsuario,
    RespuestaUsuario,
    Usuario,
    ValoracionLeccion,
)
from .schemas import (
    ActualizarUsuarioAdminRequest,
    ActualizarVideoLeccionRequest,
    CompletarLeccionRequest,
    CrearLeccionConVideoRequest,
    CrearUsuarioAdminRequest,
    CursoCreateUpdate,
    GuardarAvanceRequest,
    LoginRequest,
    OtorgarAccesoManualRequest,
    PagoSimuladoRequest,
    PreguntaInput,
    RegisterRequest,
    ResolverSolicitudRequest,
    ResponderPreguntaRequest,
    SolicitarAccesoRequest,
    ValorarLeccionRequest,
)
from .security import (
    ROLES_STAFF,
    crear_token,
    extraer_iniciales,
    hash_password,
    obtener_usuario_actual,
    requerir_admin_general,
    requerir_profesor_o_admin,
    verify_password,
)
from .seed import cargar_semilla_progreso_diego, seed_database

EXTENSIONES_VIDEO = {".mp4", ".webm", ".ogg", ".mov", ".mkv"}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="andén API — Plataforma de Microaprendizaje",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serializar_usuario(u: Usuario, valoracion_docente: Optional[dict] = None) -> dict:
    data = {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "nombre": u.nombre,
        "primerNombre": u.primer_nombre,
        "iniciales": u.iniciales,
        "rol": u.rol,
        "activo": bool(u.activo),
        "creadoEn": u.creado_en.isoformat() if u.creado_en else None,
    }
    if valoracion_docente is not None:
        data["valoracionDocente"] = valoracion_docente
    return data


def _calcular_valoraciones(
    db: Session,
    cursos: list[Curso],
    usuario_id: Optional[int] = None,
) -> dict:
    """Calcula promedios de valoración por lección, curso y profesor (autor).

    - Lección: promedio aritmético de todas las puntuaciones recibidas por ese video.
    - Curso: promedio de la valoración de sus videos valorados.
    - Profesor: promedio de la valoración de todos los videos de sus cursos.
    """
    rows = db.query(ValoracionLeccion).all()
    agrupadas: dict[int, list[ValoracionLeccion]] = {}
    for row in rows:
        agrupadas.setdefault(row.leccion_id, []).append(row)

    por_leccion: dict[int, dict] = {}
    for lid, items in agrupadas.items():
        mi_val = next((i.puntuacion for i in items if usuario_id and i.usuario_id == usuario_id), None)
        promedio = round(sum(i.puntuacion for i in items) / len(items), 2)
        por_leccion[lid] = {
            "promedio": promedio,
            "total": len(items),
            "miValoracion": mi_val,
        }

    por_curso: dict[int, dict] = {}
    videos_por_autor: dict[int, list[int]] = {}
    for c in cursos:
        lecciones_curso = [l for m in c.modulos for l in m.lecciones]
        valoradas = [por_leccion[l.id] for l in lecciones_curso if l.id in por_leccion]
        promedio_curso = (
            round(sum(v["promedio"] for v in valoradas) / len(valoradas), 2) if valoradas else None
        )
        por_curso[c.id] = {
            "promedio": promedio_curso,
            "total": sum(v["total"] for v in valoradas),
            "videosValorados": len(valoradas),
        }
        if c.creado_por_id:
            videos_por_autor.setdefault(c.creado_por_id, []).extend(l.id for l in lecciones_curso)

    por_autor: dict[int, dict] = {}
    for autor_id, lids in videos_por_autor.items():
        valoradas = [por_leccion[lid] for lid in lids if lid in por_leccion]
        promedio_autor = (
            round(sum(v["promedio"] for v in valoradas) / len(valoradas), 2) if valoradas else None
        )
        por_autor[autor_id] = {
            "promedio": promedio_autor,
            "videosValorados": len(valoradas),
            "totalVideos": len(lids),
            "totalValoraciones": sum(v["total"] for v in valoradas),
        }

    return {"por_leccion": por_leccion, "por_curso": por_curso, "por_autor": por_autor}


def _obtener_valoracion_docente(
    db: Session,
    usuario: Usuario,
    cursos: Optional[list[Curso]] = None,
) -> Optional[dict]:
    if usuario.rol not in ROLES_STAFF:
        return None
    lista_cursos = cursos if cursos is not None else _cargar_cursos_completos(db)
    val = _calcular_valoraciones(db, lista_cursos, usuario.id)
    return val["por_autor"].get(
        usuario.id,
        {"promedio": None, "videosValorados": 0, "totalVideos": 0, "totalValoraciones": 0},
    )


def _cargar_cursos_completos(db: Session) -> list[Curso]:
    return (
        db.query(Curso)
        .options(
            selectinload(Curso.modulos)
            .selectinload(Modulo.lecciones)
            .selectinload(Leccion.preguntas)
        )
        .order_by(Curso.orden, Curso.id)
        .all()
    )


def _construir_config_pregunta(q: PreguntaInput) -> str:
    tipo = q.tipo or "opcion_unica"
    cfg: dict = {"explicacion": (q.explicacion or "").strip()}
    if tipo == "opcion_unica":
        opciones = [o.strip() for o in (q.opciones or []) if o.strip()]
        if len(opciones) < 2:
            raise HTTPException(status_code=400, detail="Las preguntas de opción única necesitan al menos 2 opciones.")
        correcta = int(q.correcta or 0)
        if correcta < 0 or correcta >= len(opciones):
            correcta = 0
        cfg["opciones"] = opciones
        cfg["correcta"] = correcta
    elif tipo == "verdadero_falso":
        cfg["opciones"] = ["Verdadero", "Falso"]
        cfg["correcta"] = 0 if int(q.correcta or 0) == 0 else 1
    elif tipo == "multiple_respuesta":
        opciones = [o.strip() for o in (q.opciones or []) if o.strip()]
        if len(opciones) < 2:
            raise HTTPException(status_code=400, detail="Las preguntas de múltiple respuesta necesitan al menos 2 opciones.")
        correctas = sorted({int(i) for i in (q.correctas or []) if 0 <= int(i) < len(opciones)})
        if not correctas:
            raise HTTPException(status_code=400, detail="Marca al menos una respuesta correcta en múltiple respuesta.")
        cfg["opciones"] = opciones
        cfg["correctas"] = correctas
    elif tipo == "completacion":
        aceptadas = [r.strip() for r in (q.respuestasAceptadas or []) if r.strip()]
        if not aceptadas:
            raise HTTPException(status_code=400, detail="Indica al menos una respuesta aceptada para completación.")
        cfg["respuestasAceptadas"] = aceptadas
        cfg["pista"] = (q.pista or "").strip()
    elif tipo == "desarrollo":
        claves = [k.strip() for k in (q.palabrasClave or []) if k.strip()]
        cfg["palabrasClave"] = claves
        cfg["minPalabras"] = max(3, int(q.minPalabras or 8))
        cfg["pista"] = (q.pista or "").strip()
    return json.dumps(cfg, ensure_ascii=False)


def _curso_completado_por_usuario(curso: Curso, mapa_lecciones: dict[int, ProgresoLeccion]) -> bool:
    lecciones = [l for m in curso.modulos for l in m.lecciones]
    return len(lecciones) > 0 and all(
        (mapa_lecciones.get(l.id) and mapa_lecciones[l.id].completada) for l in lecciones
    )


def _verificar_propietario_o_admin(usuario: Usuario, curso: Curso) -> None:
    """El admin general puede editar cualquier curso; un profesor solo los cursos que él creó."""
    if usuario.rol == "admin_general":
        return
    if usuario.rol == "profesor" and curso.creado_por_id == usuario.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Solo puedes modificar o gestionar los cursos que tú creaste.",
    )


def _serializar_curso_para_usuario(
    curso: Curso,
    usuario: Usuario,
    mapa_cursos: dict[int, Curso],
    mapa_inscripciones: dict[int, InscripcionAcceso],
    mapa_lecciones: dict[int, ProgresoLeccion],
    mapa_autores: Optional[dict[int, str]] = None,
    valoraciones: Optional[dict] = None,
) -> dict:
    es_staff = usuario.rol in ROLES_STAFF
    insc = mapa_inscripciones.get(curso.id)

    if es_staff:
        tiene_acceso = True
        estado_acceso = "gratis" if curso.tipo_acceso == "gratis" else "aprobado"
    elif curso.tipo_acceso == "gratis":
        tiene_acceso = True
        estado_acceso = "gratis"
    else:
        if insc and insc.estado == "aprobado":
            tiene_acceso = True
            estado_acceso = "aprobado"
        elif insc and insc.estado == "pendiente":
            tiene_acceso = False
            estado_acceso = "pendiente"
        elif insc and insc.estado == "rechazado":
            tiene_acceso = False
            estado_acceso = "rechazado"
        else:
            tiene_acceso = False
            estado_acceso = "bloqueado"

    prereq_curso = mapa_cursos.get(curso.prerequisito_curso_id) if curso.prerequisito_curso_id else None
    if es_staff or not prereq_curso:
        prelacion_cumplida = True
    else:
        prelacion_cumplida = _curso_completado_por_usuario(prereq_curso, mapa_lecciones)

    puede_editar = usuario.rol == "admin_general" or (
        usuario.rol == "profesor" and curso.creado_por_id == usuario.id
    )
    creado_por_nombre = (
        (mapa_autores or {}).get(curso.creado_por_id) if curso.creado_por_id else None
    )

    val_curso = (valoraciones or {}).get("por_curso", {}).get(curso.id, {})
    val_lecciones = (valoraciones or {}).get("por_leccion", {})

    return {
        "id": curso.id,
        "titulo": curso.titulo,
        "categoria": curso.categoria,
        "nivel": curso.nivel,
        "descripcion": curso.descripcion,
        "color": curso.color,
        "tipoAcceso": curso.tipo_acceso,
        "precio": float(curso.precio or 0.0),
        "umbralCertificado": int(curso.umbral_certificado or 70),
        "prerequisitoCursoId": curso.prerequisito_curso_id,
        "prerequisitoTitulo": prereq_curso.titulo if prereq_curso else None,
        "creadoPorId": curso.creado_por_id,
        "creadoPorNombre": creado_por_nombre,
        "puedeEditar": puede_editar,
        "tieneAcceso": tiene_acceso,
        "estadoAcceso": estado_acceso,
        "prelacionCumplida": prelacion_cumplida,
        "valoracionPromedio": val_curso.get("promedio"),
        "totalValoraciones": val_curso.get("total", 0),
        "videosValorados": val_curso.get("videosValorados", 0),
        "modulos": [
            {
                "id": m.id,
                "orden": m.orden,
                "titulo": m.titulo,
                "lecciones": [
                    {
                        "id": l.id,
                        "orden": l.orden,
                        "titulo": l.titulo,
                        "duracion": int(l.duracion or 45),
                        "video": l.video_url,
                        "valoracionPromedio": val_lecciones.get(l.id, {}).get("promedio"),
                        "totalValoraciones": val_lecciones.get(l.id, {}).get("total", 0),
                        "miValoracion": val_lecciones.get(l.id, {}).get("miValoracion"),
                        "cuestionarios": [serializar_pregunta(q) for q in l.preguntas],
                    }
                    for l in m.lecciones
                ],
            }
            for m in curso.modulos
        ],
    }


def _verificar_acceso_curso(db: Session, usuario: Usuario, curso: Curso, cursos_todos: list[Curso]) -> None:
    if usuario.rol in ROLES_STAFF:
        return
    if curso.tipo_acceso == "restringido":
        insc = (
            db.query(InscripcionAcceso)
            .filter(
                InscripcionAcceso.usuario_id == usuario.id,
                InscripcionAcceso.curso_id == curso.id,
                InscripcionAcceso.estado == "aprobado",
            )
            .first()
        )
        if not insc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Este curso es restringido. Solicita acceso a un profesor o realiza el pago simulado.",
            )
    if curso.prerequisito_curso_id:
        prereq = next((c for c in cursos_todos if c.id == curso.prerequisito_curso_id), None)
        if prereq:
            progs = db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).all()
            mapa = {pl.leccion_id: pl for pl in progs}
            if not _curso_completado_por_usuario(prereq, mapa):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Para acceder a este curso primero debes completar el prerrequisito: {prereq.titulo}.",
                )


# =============================================================================
# SALUD
# =============================================================================
@app.get("/api/health")
def health():
    return {"ok": True, "servicio": "anden-api", "version": "3.0.0"}


# =============================================================================
# AUTENTICACIÓN Y REGISTRO (3 ROLES)
# =============================================================================
@app.post("/api/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    username = (body.username or "").strip().lower()
    password = (body.password or "").strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Ingresa tu usuario y contraseña.")

    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not verify_password(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas. Usuario o contraseña incorrectos.")
    if not usuario.activo:
        raise HTTPException(status_code=403, detail="Esta cuenta se encuentra desactivada. Contacta al administrador.")

    token = crear_token(usuario)
    val_docente = _obtener_valoracion_docente(db, usuario)
    return {"token": token, "usuario": _serializar_usuario(usuario, val_docente)}


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Registro público: siempre crea cuentas con rol 'estudiante'."""
    username = re.sub(r"\s+", "", body.username.strip().lower())
    if not re.match(r"^[a-z0-9._-]{3,40}$", username):
        raise HTTPException(
            status_code=400,
            detail="El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion o guion bajo).",
        )

    if db.query(Usuario).filter(Usuario.username == username).first():
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso.")

    email = (body.email or "").strip().lower() or None
    if email and db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=409, detail="Ese correo electrónico ya está registrado.")

    nombre = body.nombre.strip()
    primer_nombre = nombre.split()[0]

    nuevo = Usuario(
        username=username,
        email=email,
        nombre=nombre,
        primer_nombre=primer_nombre,
        iniciales=extraer_iniciales(nombre),
        password_hash=hash_password(body.password.strip()),
        rol="estudiante",  # Nunca permite auto-asignarse profesor o admin
        activo=True,
    )
    db.add(nuevo)
    db.flush()
    asegurar_progreso_usuario(db, nuevo.id)
    db.commit()
    db.refresh(nuevo)

    token = crear_token(nuevo)
    return {"token": token, "usuario": _serializar_usuario(nuevo)}


@app.get("/api/auth/me")
def me(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    val_docente = _obtener_valoracion_docente(db, usuario)
    return {"usuario": _serializar_usuario(usuario, val_docente)}


@app.get("/api/docente/valoracion")
def obtener_mi_valoracion_docente(
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    return _obtener_valoracion_docente(db, usuario)


# =============================================================================
# CURSOS, LECCIONES, CHECKPOINTS Y VIDEOS
# =============================================================================
@app.get("/api/cursos")
def listar_cursos(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    mapa_cursos = {c.id: c for c in cursos}
    mapa_autores = {u.id: u.nombre for u in db.query(Usuario).all()}
    inscripciones = db.query(InscripcionAcceso).filter(InscripcionAcceso.usuario_id == usuario.id).all()
    mapa_insc = {i.curso_id: i for i in inscripciones}
    progs = db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).all()
    mapa_lecciones = {p.leccion_id: p for p in progs}
    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)

    return [
        _serializar_curso_para_usuario(c, usuario, mapa_cursos, mapa_insc, mapa_lecciones, mapa_autores, valoraciones)
        for c in cursos
    ]


@app.post("/api/cursos", status_code=201)
def crear_curso(
    body: CursoCreateUpdate,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    if body.prerequisitoCursoId is not None:
        if not db.get(Curso, body.prerequisitoCursoId):
            raise HTTPException(status_code=400, detail="El curso prerrequisito indicado no existe.")

    precio_final = 0.0 if body.tipoAcceso == "gratis" else float(body.precio or 0.0)
    max_orden = db.query(Curso).count()

    curso = Curso(
        titulo=body.titulo.strip(),
        categoria=body.categoria.strip(),
        nivel=body.nivel.strip(),
        descripcion=body.descripcion.strip(),
        color=body.color.strip(),
        tipo_acceso=body.tipoAcceso,
        precio=precio_final,
        umbral_certificado=body.umbralCertificado,
        prerequisito_curso_id=body.prerequisitoCursoId,
        orden=max_orden + 1,
        creado_por_id=usuario.id,
    )
    db.add(curso)
    db.flush()

    modulos_input = body.modulos or []
    if not modulos_input:
        m = Modulo(curso_id=curso.id, orden=1, titulo="Módulo 1: Fundamentos")
        db.add(m)
        db.flush()
        db.add(Leccion(modulo_id=m.id, orden=1, titulo="Introducción al curso", duracion=45, video_url="/videos/101.mp4"))
    else:
        for m_idx, m_in in enumerate(modulos_input, start=1):
            m = Modulo(curso_id=curso.id, orden=m_idx, titulo=m_in.titulo.strip())
            db.add(m)
            db.flush()
            lecciones_in = m_in.lecciones or []
            for l_idx, l_in in enumerate(lecciones_in, start=1):
                lecc = Leccion(
                    modulo_id=m.id,
                    orden=l_idx,
                    titulo=l_in.titulo.strip(),
                    duracion=max(5, int(l_in.duracion)) if l_in.duracion else 45,
                    video_url=l_in.video or "/videos/101.mp4",
                )
                db.add(lecc)
                db.flush()
                for q_in in l_in.cuestionarios:
                    if q_in.segundo >= lecc.duracion:
                        raise HTTPException(
                            status_code=400,
                            detail="No se pueden agregar preguntas fuera de los límites del propio video.",
                        )
                    db.add(
                        Pregunta(
                            leccion_id=lecc.id,
                            segundo=q_in.segundo,
                            tipo=q_in.tipo,
                            pregunta=q_in.pregunta.strip(),
                            config_json=_construir_config_pregunta(q_in),
                        )
                    )

    db.commit()
    cursos = _cargar_cursos_completos(db)
    mapa_cursos = {c.id: c for c in cursos}
    mapa_autores = {u.id: u.nombre for u in db.query(Usuario).all()}
    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)
    creado = mapa_cursos[curso.id]
    return _serializar_curso_para_usuario(creado, usuario, mapa_cursos, {}, {}, mapa_autores, valoraciones)


@app.put("/api/cursos/{curso_id}")
def editar_curso(
    curso_id: int,
    body: CursoCreateUpdate,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    curso = (
        db.query(Curso)
        .options(selectinload(Curso.modulos).selectinload(Modulo.lecciones).selectinload(Leccion.preguntas))
        .filter(Curso.id == curso_id)
        .first()
    )
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_propietario_o_admin(usuario, curso)

    if body.prerequisitoCursoId is not None:
        if body.prerequisitoCursoId == curso_id:
            raise HTTPException(status_code=400, detail="Un curso no puede ser prerrequisito de sí mismo.")
        prereq = db.get(Curso, body.prerequisitoCursoId)
        if not prereq:
            raise HTTPException(status_code=400, detail="El curso prerrequisito indicado no existe.")
        if prereq.prerequisito_curso_id == curso_id:
            raise HTTPException(status_code=400, detail="Prelación circular detectada entre ambos cursos.")

    curso.titulo = body.titulo.strip()
    curso.categoria = body.categoria.strip()
    curso.nivel = body.nivel.strip()
    curso.descripcion = body.descripcion.strip()
    curso.color = body.color.strip()
    curso.tipo_acceso = body.tipoAcceso
    curso.precio = 0.0 if body.tipoAcceso == "gratis" else float(body.precio or 0.0)
    curso.umbral_certificado = body.umbralCertificado
    curso.prerequisito_curso_id = body.prerequisitoCursoId

    # Sincronizar módulos y lecciones preservando IDs y duraciones reales de video
    if body.modulos:
        modulos_existentes = {m.id: m for m in curso.modulos}
        lecciones_existentes = {l.id: l for m in curso.modulos for l in m.lecciones}
        modulos_conservados: set[int] = set()
        lecciones_conservadas: set[int] = set()

        for m_idx, m_in in enumerate(body.modulos, start=1):
            if m_in.id and m_in.id in modulos_existentes:
                m_obj = modulos_existentes[m_in.id]
                m_obj.titulo = m_in.titulo.strip()
                m_obj.orden = m_idx
            else:
                m_obj = Modulo(curso_id=curso.id, orden=m_idx, titulo=m_in.titulo.strip())
                db.add(m_obj)
                db.flush()
            modulos_conservados.add(m_obj.id)

            for l_idx, l_in in enumerate(m_in.lecciones, start=1):
                if l_in.id and l_in.id in lecciones_existentes:
                    l_obj = lecciones_existentes[l_in.id]
                    l_obj.modulo_id = m_obj.id
                    l_obj.titulo = l_in.titulo.strip()
                    l_obj.orden = l_idx
                    # Conservar la duración real del video; solo actualizar si no tenía
                    if not l_obj.duracion:
                        l_obj.duracion = max(5, int(l_in.duracion)) if l_in.duracion else 45
                    if l_in.video:
                        l_obj.video_url = l_in.video
                else:
                    l_obj = Leccion(
                        modulo_id=m_obj.id,
                        orden=l_idx,
                        titulo=l_in.titulo.strip(),
                        duracion=max(5, int(l_in.duracion)) if l_in.duracion else 45,
                        video_url=l_in.video or "/videos/101.mp4",
                    )
                    db.add(l_obj)
                    db.flush()
                lecciones_conservadas.add(l_obj.id)

        for lid, l_obj in lecciones_existentes.items():
            if lid not in lecciones_conservadas:
                db.delete(l_obj)
        for mid, m_obj in modulos_existentes.items():
            if mid not in modulos_conservados:
                db.delete(m_obj)

    db.commit()
    cursos = _cargar_cursos_completos(db)
    mapa_cursos = {c.id: c for c in cursos}
    mapa_autores = {u.id: u.nombre for u in db.query(Usuario).all()}
    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)
    return _serializar_curso_para_usuario(mapa_cursos[curso_id], usuario, mapa_cursos, {}, {}, mapa_autores, valoraciones)


@app.delete("/api/cursos/{curso_id}")
def eliminar_curso(
    curso_id: int,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_propietario_o_admin(usuario, curso)
    # Desvincular prelaciones que apuntaran a este curso
    db.query(Curso).filter(Curso.prerequisito_curso_id == curso_id).update({Curso.prerequisito_curso_id: None})
    db.delete(curso)
    db.commit()
    return {"ok": True}


@app.post("/api/cursos/{curso_id}/lecciones", status_code=201)
def agregar_leccion_con_video(
    curso_id: int,
    body: CrearLeccionConVideoRequest,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    curso = (
        db.query(Curso)
        .options(selectinload(Curso.modulos).selectinload(Modulo.lecciones))
        .filter(Curso.id == curso_id)
        .first()
    )
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_propietario_o_admin(usuario, curso)
    if not curso.modulos:
        raise HTTPException(status_code=400, detail="El curso no tiene módulos configurados.")

    modulo = next((m for m in curso.modulos if body.moduloId and m.id == body.moduloId), curso.modulos[0])
    duracion = max(5, int(body.duracion or 45))

    for q in body.cuestionarios:
        if q.segundo >= duracion:
            raise HTTPException(
                status_code=400,
                detail="No se pueden agregar preguntas fuera de los límites del propio video.",
            )

    nueva = Leccion(
        modulo_id=modulo.id,
        orden=len(modulo.lecciones) + 1,
        titulo=body.titulo.strip(),
        duracion=duracion,
        video_url=body.video or "/videos/101.mp4",
    )
    db.add(nueva)
    db.flush()

    for q in sorted(body.cuestionarios, key=lambda x: x.segundo):
        db.add(
            Pregunta(
                leccion_id=nueva.id,
                segundo=q.segundo,
                tipo=q.tipo,
                pregunta=q.pregunta.strip(),
                config_json=_construir_config_pregunta(q),
            )
        )

    db.commit()
    cursos = _cargar_cursos_completos(db)
    mapa_cursos = {c.id: c for c in cursos}
    mapa_autores = {u.id: u.nombre for u in db.query(Usuario).all()}
    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)
    return {
        "ok": True,
        "leccionId": nueva.id,
        "curso": _serializar_curso_para_usuario(mapa_cursos[curso_id], usuario, mapa_cursos, {}, {}, mapa_autores, valoraciones),
    }


@app.put("/api/lecciones/{leccion_id}")
def actualizar_video_leccion(
    leccion_id: int,
    body: ActualizarVideoLeccionRequest,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    leccion = (
        db.query(Leccion)
        .options(selectinload(Leccion.preguntas), selectinload(Leccion.modulo))
        .filter(Leccion.id == leccion_id)
        .first()
    )
    if not leccion:
        raise HTTPException(status_code=404, detail="Lección no encontrada.")
    curso_padre = db.get(Curso, leccion.modulo.curso_id)
    if not curso_padre:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_propietario_o_admin(usuario, curso_padre)

    duracion_final = max(5, int(body.duracion or leccion.duracion or 60))
    for q in body.cuestionarios:
        if q.segundo >= duracion_final:
            raise HTTPException(
                status_code=400,
                detail="No se pueden agregar preguntas fuera de los límites del propio video.",
            )

    if body.video:
        leccion.video_url = body.video
    leccion.duracion = duracion_final

    # Reemplazar/actualizar preguntas preservando IDs existentes cuando coincidan
    existentes = {p.id: p for p in leccion.preguntas}
    conservadas: set[int] = set()

    for q in sorted(body.cuestionarios, key=lambda x: x.segundo):
        cfg_str = _construir_config_pregunta(q)
        if q.id and q.id in existentes:
            p_obj = existentes[q.id]
            p_obj.segundo = q.segundo
            p_obj.tipo = q.tipo
            p_obj.pregunta = q.pregunta.strip()
            p_obj.config_json = cfg_str
            conservadas.add(p_obj.id)
        else:
            p_obj = Pregunta(
                leccion_id=leccion.id,
                segundo=q.segundo,
                tipo=q.tipo,
                pregunta=q.pregunta.strip(),
                config_json=cfg_str,
            )
            db.add(p_obj)
            db.flush()
            conservadas.add(p_obj.id)

    for pid, p_obj in existentes.items():
        if pid not in conservadas:
            db.delete(p_obj)

    curso_id = leccion.modulo.curso_id
    db.commit()
    cursos = _cargar_cursos_completos(db)
    mapa_cursos = {c.id: c for c in cursos}
    mapa_autores = {u.id: u.nombre for u in db.query(Usuario).all()}
    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)
    return {
        "ok": True,
        "curso": _serializar_curso_para_usuario(mapa_cursos[curso_id], usuario, mapa_cursos, {}, {}, mapa_autores, valoraciones),
    }


@app.post("/api/lecciones/{leccion_id}/valorar")
def valorar_leccion(
    leccion_id: int,
    body: ValorarLeccionRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    leccion = (
        db.query(Leccion)
        .options(selectinload(Leccion.modulo))
        .filter(Leccion.id == leccion_id)
        .first()
    )
    if not leccion or not leccion.modulo:
        raise HTTPException(status_code=404, detail="Lección no encontrada.")

    cursos = _cargar_cursos_completos(db)
    curso_padre = next((c for c in cursos if c.id == leccion.modulo.curso_id), None)
    if not curso_padre:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    _verificar_acceso_curso(db, usuario, curso_padre, cursos)

    existente = (
        db.query(ValoracionLeccion)
        .filter(
            ValoracionLeccion.usuario_id == usuario.id,
            ValoracionLeccion.leccion_id == leccion_id,
        )
        .first()
    )
    if existente:
        existente.puntuacion = body.puntuacion
    else:
        db.add(
            ValoracionLeccion(
                usuario_id=usuario.id,
                leccion_id=leccion_id,
                puntuacion=body.puntuacion,
            )
        )
    db.commit()

    valoraciones = _calcular_valoraciones(db, cursos, usuario.id)
    val_leccion = valoraciones["por_leccion"].get(
        leccion_id,
        {"promedio": float(body.puntuacion), "total": 1, "miValoracion": body.puntuacion},
    )
    val_curso = valoraciones["por_curso"].get(
        curso_padre.id,
        {"promedio": float(body.puntuacion), "total": 1, "videosValorados": 1},
    )

    return {
        "ok": True,
        "leccionId": leccion_id,
        "cursoId": curso_padre.id,
        "miValoracion": body.puntuacion,
        "leccion": {
            "valoracionPromedio": val_leccion["promedio"],
            "totalValoraciones": val_leccion["total"],
            "miValoracion": val_leccion["miValoracion"],
        },
        "curso": {
            "valoracionPromedio": val_curso["promedio"],
            "totalValoraciones": val_curso["total"],
            "videosValorados": val_curso["videosValorados"],
        },
    }


@app.post("/api/videos/upload")
async def subir_video(
    file: UploadFile = File(...),
    _usuario: Usuario = Depends(requerir_profesor_o_admin),
):
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in EXTENSIONES_VIDEO:
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Sube un archivo .mp4, .webm, .ogg, .mov o .mkv.",
        )

    nombre_archivo = f"{uuid.uuid4().hex}{ext}"
    destino = UPLOADS_DIR / nombre_archivo
    tamano = 0
    with destino.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            tamano += len(chunk)
            if tamano > 250 * 1024 * 1024:
                out.close()
                destino.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="El video supera el límite de 250 MB.")
            out.write(chunk)

    return {
        "ok": True,
        "videoUrl": f"/uploads/videos/{nombre_archivo}",
        "nombreOriginal": file.filename,
        "tamano": tamano,
    }


@app.get("/uploads/videos/{filename}")
def servir_video_subido(filename: str, request: Request):
    """Sirve videos subidos con soporte HTTP Range para adelantar/retroceder en <video>."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")
    ruta = (UPLOADS_DIR / filename).resolve()
    if not str(ruta).startswith(str(UPLOADS_DIR.resolve())) or not ruta.is_file():
        raise HTTPException(status_code=404, detail="Video no encontrado.")

    file_size = ruta.stat().st_size
    content_type = mimetypes.guess_type(str(ruta))[0] or "video/mp4"
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(str(ruta), media_type=content_type, headers={"Accept-Ranges": "bytes"})

    m = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not m:
        return FileResponse(str(ruta), media_type=content_type, headers={"Accept-Ranges": "bytes"})

    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else min(start + 2 * 1024 * 1024 - 1, file_size - 1)
    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Rango inválido.")

    chunk_len = end - start + 1

    def iterfile():
        with ruta.open("rb") as f:
            f.seek(start)
            restante = chunk_len
            while restante > 0:
                data = f.read(min(65536, restante))
                if not data:
                    break
                restante -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_len),
    }
    return StreamingResponse(iterfile(), status_code=206, media_type=content_type, headers=headers)


# =============================================================================
# ACCESO A CURSOS RESTRINGIDOS (SOLICITUD AL PROFESOR + PAGO SIMULADO)
# =============================================================================
@app.post("/api/cursos/{curso_id}/solicitar-acceso")
def solicitar_acceso_curso(
    curso_id: int,
    body: SolicitarAccesoRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    if curso.tipo_acceso == "gratis":
        return {"ok": True, "estado": "gratis", "mensaje": "Este curso ya es gratuito."}

    insc = (
        db.query(InscripcionAcceso)
        .filter(InscripcionAcceso.usuario_id == usuario.id, InscripcionAcceso.curso_id == curso_id)
        .first()
    )
    if insc and insc.estado == "aprobado":
        return {"ok": True, "estado": "aprobado", "mensaje": "Ya tienes acceso aprobado a este curso."}

    if insc:
        insc.estado = "pendiente"
        insc.metodo = "solicitud_profesor"
        insc.mensaje_solicitud = body.mensaje.strip()
        insc.actualizado_en = datetime.now(timezone.utc)
    else:
        insc = InscripcionAcceso(
            usuario_id=usuario.id,
            curso_id=curso_id,
            estado="pendiente",
            metodo="solicitud_profesor",
            mensaje_solicitud=body.mensaje.strip(),
        )
        db.add(insc)
    db.commit()
    return {
        "ok": True,
        "estado": "pendiente",
        "mensaje": "Solicitud enviada. Un profesor o administrador revisará y habilitará tu acceso.",
    }


@app.post("/api/cursos/{curso_id}/pagar-simulado")
def pagar_curso_simulado(
    curso_id: int,
    body: PagoSimuladoRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    referencia = f"SIM-{uuid.uuid4().hex[:8].upper()}"
    insc = (
        db.query(InscripcionAcceso)
        .filter(InscripcionAcceso.usuario_id == usuario.id, InscripcionAcceso.curso_id == curso_id)
        .first()
    )
    if insc:
        insc.estado = "aprobado"
        insc.metodo = "pago_simulado"
        insc.metodo_pago = body.metodoPago.strip()
        insc.referencia_pago = referencia
        insc.monto_pagado = float(curso.precio or 0.0)
        insc.actualizado_en = datetime.now(timezone.utc)
    else:
        insc = InscripcionAcceso(
            usuario_id=usuario.id,
            curso_id=curso_id,
            estado="aprobado",
            metodo="pago_simulado",
            metodo_pago=body.metodoPago.strip(),
            referencia_pago=referencia,
            monto_pagado=float(curso.precio or 0.0),
        )
        db.add(insc)
    db.commit()
    return {
        "ok": True,
        "estado": "aprobado",
        "referencia": referencia,
        "monto": float(curso.precio or 0.0),
        "mensaje": f"Pago simulado aprobado ({referencia}). Ya tienes acceso completo a {curso.titulo}.",
    }


# =============================================================================
# PROGRESO, EVALUACIÓN DE 5 TIPOS DE PREGUNTA, LOGROS, ÁRBOL Y CERTIFICADOS
# =============================================================================
@app.get("/api/progreso")
def obtener_progreso(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()
    return estado


@app.post("/api/progreso/avance")
def guardar_avance(
    body: GuardarAvanceRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    curso = next((c for c in cursos if c.id == body.cursoId), None)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_acceso_curso(db, usuario, curso, cursos)

    leccion = db.get(Leccion, body.leccionId)
    if not leccion:
        raise HTTPException(status_code=404, detail="Lección no encontrada.")

    # Sincronizar automáticamente la duración real reportada por el <video> del navegador
    if body.duracionReal and body.duracionReal > 0 and int(leccion.duracion or 0) != int(body.duracionReal):
        leccion.duracion = int(body.duracionReal)

    duracion_efectiva = max(int(body.duracionReal or 0), int(leccion.duracion or 0), int(body.segundo))

    pu = asegurar_progreso_usuario(db, usuario.id)
    pu.ultima_curso_id = body.cursoId
    pu.ultima_leccion_id = body.leccionId

    pl = (
        db.query(ProgresoLeccion)
        .filter(ProgresoLeccion.usuario_id == usuario.id, ProgresoLeccion.leccion_id == body.leccionId)
        .first()
    )
    if pl:
        pl.maximo = max(int(pl.maximo or 0), min(body.segundo, duracion_efectiva))
    else:
        pl = ProgresoLeccion(
            usuario_id=usuario.id,
            leccion_id=body.leccionId,
            maximo=min(body.segundo, duracion_efectiva),
            completada=False,
        )
        db.add(pl)

    registrar_actividad_hoy(db, usuario.id)
    db.flush()
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()
    return estado


@app.post("/api/progreso/responder")
def responder_pregunta(
    body: ResponderPreguntaRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    pregunta = (
        db.query(Pregunta)
        .options(selectinload(Pregunta.leccion).selectinload(Leccion.modulo))
        .filter(Pregunta.id == body.preguntaId)
        .first()
    )
    if not pregunta:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada.")

    curso_id = pregunta.leccion.modulo.curso_id
    cursos = _cargar_cursos_completos(db)
    curso = next((c for c in cursos if c.id == curso_id), None)
    if curso:
        _verificar_acceso_curso(db, usuario, curso, cursos)

    evaluacion = evaluar_respuesta(pregunta, body.respuesta, body.intento)
    pu = asegurar_progreso_usuario(db, usuario.id)
    registrar_actividad_hoy(db, usuario.id)

    xp_ganado = 0
    resp_existente = (
        db.query(RespuestaUsuario)
        .filter(RespuestaUsuario.usuario_id == usuario.id, RespuestaUsuario.pregunta_id == pregunta.id)
        .first()
    )

    if evaluacion["correcta"]:
        if not resp_existente:
            es_primero = int(body.intento) <= 1
            xp_ganado = xp_por_respuesta(body.intento)
            pu.xp = int(pu.xp or 0) + xp_ganado
            if es_primero:
                pu.racha_aciertos_actual = int(pu.racha_aciertos_actual or 0) + 1
                pu.mejor_racha_aciertos = max(int(pu.mejor_racha_aciertos or 0), pu.racha_aciertos_actual)
            else:
                pu.racha_aciertos_actual = 0

            db.add(
                RespuestaUsuario(
                    usuario_id=usuario.id,
                    pregunta_id=pregunta.id,
                    leccion_id=pregunta.leccion_id,
                    curso_id=curso_id,
                    intentos=int(body.intento),
                    acertada_primer_intento=es_primero,
                    puntaje=float(evaluacion["puntaje"]),
                    respuesta_json=json.dumps({"valor": body.respuesta}, ensure_ascii=False),
                )
            )
        elif body.modoRepaso:
            # Permite mejorar el puntaje del curso al repasar (para alcanzar el certificado) sin duplicar XP
            if float(evaluacion["puntaje"]) > float(resp_existente.puntaje or 0.0):
                resp_existente.puntaje = float(evaluacion["puntaje"])
                resp_existente.intentos = min(int(resp_existente.intentos or body.intento), int(body.intento))
                if int(body.intento) <= 1:
                    resp_existente.acertada_primer_intento = True
                resp_existente.respuesta_json = json.dumps({"valor": body.respuesta, "repaso": True}, ensure_ascii=False)
                resp_existente.respondida_en = datetime.now(timezone.utc)
    else:
        if not resp_existente:
            pu.racha_aciertos_actual = 0

    db.flush()
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()

    return {
        "correcta": evaluacion["correcta"],
        "puntaje": evaluacion["puntaje"],
        "xpGanado": xp_ganado,
        "mensaje": evaluacion["mensaje"],
        "detalles": evaluacion["detalles"],
        "progreso": estado,
    }


@app.post("/api/progreso/completar-leccion")
def completar_leccion(
    body: CompletarLeccionRequest,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    curso = next((c for c in cursos if c.id == body.cursoId), None)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")
    _verificar_acceso_curso(db, usuario, curso, cursos)

    lecciones_curso = [l for m in curso.modulos for l in m.lecciones]
    leccion = next((l for l in lecciones_curso if l.id == body.leccionId), None)
    if not leccion:
        raise HTTPException(status_code=404, detail="Lección no encontrada en este curso.")

    if body.duracionReal and body.duracionReal > 0 and int(leccion.duracion or 0) != int(body.duracionReal):
        leccion.duracion = int(body.duracionReal)

    pu = asegurar_progreso_usuario(db, usuario.id)
    registrar_actividad_hoy(db, usuario.id)

    pl = (
        db.query(ProgresoLeccion)
        .filter(ProgresoLeccion.usuario_id == usuario.id, ProgresoLeccion.leccion_id == leccion.id)
        .first()
    )
    ya_completada = bool(pl and pl.completada)
    xp_ganado = 0

    if not ya_completada:
        now = datetime.now(timezone.utc)
        if pl:
            pl.maximo = int(leccion.duracion or pl.maximo or 0)
            pl.completada = True
            pl.completada_en = now
        else:
            pl = ProgresoLeccion(
                usuario_id=usuario.id,
                leccion_id=leccion.id,
                maximo=int(leccion.duracion or 0),
                completada=True,
                completada_en=now,
            )
            db.add(pl)

        xp_ganado += XP_LECCION
        db.flush()

        # Verificar si terminó todo el curso
        progs_actuales = {
            p.leccion_id: p
            for p in db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).all()
        }
        if _curso_completado_por_usuario(curso, progs_actuales):
            xp_ganado += XP_CURSO

        pu.xp = int(pu.xp or 0) + xp_ganado

        # Avanzar ultimaLeccion a la siguiente del curso si existe
        idx = lecciones_curso.index(leccion)
        if idx + 1 < len(lecciones_curso):
            pu.ultima_curso_id = curso.id
            pu.ultima_leccion_id = lecciones_curso[idx + 1].id

    db.flush()
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()
    return {"ok": True, "xpGanado": xp_ganado, "progreso": estado}


@app.post("/api/progreso/reiniciar")
def reiniciar_progreso(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).delete()
    db.query(RespuestaUsuario).filter(RespuestaUsuario.usuario_id == usuario.id).delete()
    db.query(ActividadDiaria).filter(ActividadDiaria.usuario_id == usuario.id).delete()
    db.query(LogroUsuario).filter(LogroUsuario.usuario_id == usuario.id).delete()
    db.query(Certificado).filter(Certificado.usuario_id == usuario.id).delete()
    db.query(ProgresoUsuario).filter(ProgresoUsuario.usuario_id == usuario.id).delete()
    db.flush()

    if usuario.username == "diego":
        cargar_semilla_progreso_diego(db, usuario)
    else:
        asegurar_progreso_usuario(db, usuario.id)

    cursos = _cargar_cursos_completos(db)
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()
    return estado


# =============================================================================
# CERTIFICADOS
# =============================================================================
@app.get("/api/certificados")
def listar_certificados(
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    estado = construir_estado_progreso(db, usuario, cursos)
    db.commit()
    return estado["certificados"]


@app.get("/api/certificados/curso/{curso_id}")
def obtener_certificado_curso(
    curso_id: int,
    usuario: Usuario = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    cursos = _cargar_cursos_completos(db)
    curso = next((c for c in cursos if c.id == curso_id), None)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    progs = {p.leccion_id: p for p in db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).all()}
    resps = {r.pregunta_id: r for r in db.query(RespuestaUsuario).filter(RespuestaUsuario.usuario_id == usuario.id).all()}
    stats = calcular_estadisticas_curso(curso, progs, resps)
    cert = verificar_y_emitir_certificado(db, usuario.id, curso, stats)
    db.commit()

    if not cert:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Aún no cumples los requisitos del certificado (completado: {stats['porcentajeAvance']} %, "
                f"aciertos: {stats['porcentajeAciertos']} % / mínimo {stats['umbralCertificado']} %)."
            ),
        )

    return {
        "id": cert.id,
        "codigo": cert.codigo,
        "cursoId": curso.id,
        "cursoTitulo": curso.titulo,
        "cursoCategoria": curso.categoria,
        "cursoNivel": curso.nivel,
        "cursoColor": curso.color,
        "totalLecciones": stats["totalLecciones"],
        "estudianteNombre": usuario.nombre,
        "estudianteUsername": usuario.username,
        "porcentajeAciertos": cert.porcentaje_aciertos,
        "umbralCertificado": stats["umbralCertificado"],
        "emitidoEn": formatear_fecha_es(cert.emitido_en),
        "emitidoIso": cert.emitido_en.isoformat() if cert.emitido_en else None,
    }


@app.get("/api/certificados/verificar/{codigo}")
def verificar_certificado_publico(codigo: str, db: Session = Depends(get_db)):
    cert = db.query(Certificado).filter(Certificado.codigo == codigo.strip().upper()).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Código de certificado no encontrado.")
    est = db.get(Usuario, cert.usuario_id)
    curso = db.get(Curso, cert.curso_id)
    return {
        "valido": True,
        "codigo": cert.codigo,
        "estudianteNombre": est.nombre if est else "Estudiante",
        "cursoTitulo": curso.titulo if curso else "Curso",
        "porcentajeAciertos": cert.porcentaje_aciertos,
        "emitidoEn": formatear_fecha_es(cert.emitido_en),
    }


# =============================================================================
# PANEL ADMIN / PROFESOR: SOLICITUDES DE ACCESO Y GESTIÓN DE USUARIOS/ROLES
# =============================================================================
@app.get("/api/admin/solicitudes")
def listar_solicitudes(
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    inscripciones = db.query(InscripcionAcceso).order_by(InscripcionAcceso.actualizado_en.desc()).all()
    usuarios = {u.id: u for u in db.query(Usuario).all()}
    cursos = {c.id: c for c in db.query(Curso).all()}

    salida = []
    for i in inscripciones:
        est = usuarios.get(i.usuario_id)
        cur = cursos.get(i.curso_id)
        if not est or not cur:
            continue
        # Un profesor solo ve las solicitudes de sus propios cursos
        if usuario.rol == "profesor" and cur.creado_por_id != usuario.id:
            continue
        salida.append(
            {
                "id": i.id,
                "usuarioId": est.id,
                "estudianteNombre": est.nombre,
                "estudianteUsername": est.username,
                "cursoId": cur.id,
                "cursoTitulo": cur.titulo,
                "cursoTipoAcceso": cur.tipo_acceso,
                "cursoPrecio": float(cur.precio or 0.0),
                "estado": i.estado,
                "metodo": i.metodo,
                "mensajeSolicitud": i.mensaje_solicitud,
                "metodoPago": i.metodo_pago,
                "referenciaPago": i.referencia_pago,
                "montoPagado": i.monto_pagado,
                "creadoEn": i.creado_en.isoformat() if i.creado_en else None,
                "actualizadoEn": i.actualizado_en.isoformat() if i.actualizado_en else None,
            }
        )
    return salida


@app.put("/api/admin/solicitudes/{inscripcion_id}")
def resolver_solicitud(
    inscripcion_id: int,
    body: ResolverSolicitudRequest,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    insc = db.get(InscripcionAcceso, inscripcion_id)
    if not insc:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    curso = db.get(Curso, insc.curso_id)
    if curso:
        _verificar_propietario_o_admin(usuario, curso)
    insc.estado = body.estado
    insc.aprobado_por_id = usuario.id
    insc.actualizado_en = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "id": insc.id, "estado": insc.estado}


@app.post("/api/admin/accesos/otorgar")
def otorgar_acceso_manual(
    body: OtorgarAccesoManualRequest,
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    est = db.get(Usuario, body.usuarioId)
    cur = db.get(Curso, body.cursoId)
    if not est or not cur:
        raise HTTPException(status_code=404, detail="Usuario o curso no encontrado.")
    _verificar_propietario_o_admin(usuario, cur)

    insc = (
        db.query(InscripcionAcceso)
        .filter(InscripcionAcceso.usuario_id == est.id, InscripcionAcceso.curso_id == cur.id)
        .first()
    )
    if insc:
        insc.estado = body.estado
        insc.metodo = "admin"
        insc.aprobado_por_id = usuario.id
        insc.actualizado_en = datetime.now(timezone.utc)
    else:
        insc = InscripcionAcceso(
            usuario_id=est.id,
            curso_id=cur.id,
            estado=body.estado,
            metodo="admin",
            mensaje_solicitud=f"Gestionado por {usuario.nombre}",
            aprobado_por_id=usuario.id,
        )
        db.add(insc)
    db.commit()
    return {"ok": True, "estado": insc.estado}


@app.get("/api/admin/usuarios")
def listar_usuarios(
    usuario: Usuario = Depends(requerir_profesor_o_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Usuario).order_by(Usuario.creado_en.desc())
    if usuario.rol != "admin_general":
        # El profesor solo lista estudiantes (para gestionar permisos de cursos)
        query = query.filter(Usuario.rol == "estudiante")
    usuarios = query.all()
    inscripciones = db.query(InscripcionAcceso).filter(InscripcionAcceso.estado == "aprobado").all()
    cursos_por_usuario: dict[int, list[int]] = {}
    for i in inscripciones:
        cursos_por_usuario.setdefault(i.usuario_id, []).append(i.curso_id)

    resultado = []
    for u in usuarios:
        d = _serializar_usuario(u)
        d["cursosAprobados"] = cursos_por_usuario.get(u.id, [])
        resultado.append(d)
    return resultado


@app.post("/api/admin/usuarios", status_code=201)
def crear_usuario_admin(
    body: CrearUsuarioAdminRequest,
    admin: Usuario = Depends(requerir_admin_general),
    db: Session = Depends(get_db),
):
    """Solo el Administrador general puede crear profesores u otros administradores."""
    username = re.sub(r"\s+", "", body.username.strip().lower())
    if not re.match(r"^[a-z0-9._-]{3,40}$", username):
        raise HTTPException(status_code=400, detail="Formato de nombre de usuario inválido.")
    if db.query(Usuario).filter(Usuario.username == username).first():
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya existe.")

    email = (body.email or "").strip().lower() or None
    if email and db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=409, detail="Ese correo ya está en uso.")

    nombre = body.nombre.strip()
    nuevo = Usuario(
        username=username,
        email=email,
        nombre=nombre,
        primer_nombre=nombre.split()[0],
        iniciales=extraer_iniciales(nombre),
        password_hash=hash_password(body.password.strip()),
        rol=body.rol,
        activo=True,
        creado_por_id=admin.id,
    )
    db.add(nuevo)
    db.flush()
    asegurar_progreso_usuario(db, nuevo.id)
    db.commit()
    db.refresh(nuevo)
    return {"ok": True, "usuario": _serializar_usuario(nuevo)}


@app.patch("/api/admin/usuarios/{user_id}")
def actualizar_usuario_admin(
    user_id: int,
    body: ActualizarUsuarioAdminRequest,
    admin: Usuario = Depends(requerir_admin_general),
    db: Session = Depends(get_db),
):
    objetivo = db.get(Usuario, user_id)
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if objetivo.id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes desactivar o cambiar tu propio rol.")
    if body.activo is not None:
        objetivo.activo = body.activo
    if body.rol is not None:
        objetivo.rol = body.rol
    db.commit()
    db.refresh(objetivo)
    return {"ok": True, "usuario": _serializar_usuario(objetivo)}
