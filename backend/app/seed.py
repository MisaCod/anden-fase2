from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
from sqlalchemy.orm import Session

from .database import PROJECT_ROOT
from .gamificacion import construir_estado_progreso
from .models import (
    ActividadDiaria,
    Curso,
    InscripcionAcceso,
    Leccion,
    Modulo,
    Pregunta,
    ProgresoLeccion,
    ProgresoUsuario,
    RespuestaUsuario,
    Usuario,
)
from .security import extraer_iniciales, hash_password


# Configuración de acceso, precio y prelación opcional para el catálogo inicial
CONFIG_CURSOS_SEED = {
    1: {"tipo_acceso": "gratis", "precio": 0.0, "umbral": 70, "prereq": None},
    2: {"tipo_acceso": "gratis", "precio": 0.0, "umbral": 70, "prereq": None},
    3: {"tipo_acceso": "restringido", "precio": 14.99, "umbral": 70, "prereq": None},
    4: {"tipo_acceso": "restringido", "precio": 19.99, "umbral": 70, "prereq": None},
    5: {"tipo_acceso": "restringido", "precio": 24.99, "umbral": 75, "prereq": 4},  # Prelación opcional: SQL antes que Python
    6: {"tipo_acceso": "gratis", "precio": 0.0, "umbral": 70, "prereq": None},
}

# Preguntas extra con los 4 nuevos tipos (V/F, múltiple respuesta, completación y desarrollo)
# para que se puedan demostrar en vivo desde la primera lección en curso y el catálogo inicial.
PREGUNTAS_VARIADAS_SEED = {
    102: [
        {
            "segundo": 32,
            "tipo": "verdadero_falso",
            "pregunta": "En React, un componente puede reutilizarse varias veces en distintas pantallas con diferentes datos.",
            "config": {
                "opciones": ["Verdadero", "Falso"],
                "correcta": 0,
                "explicacion": "La reutilización con distintas props es una de las principales ventajas de los componentes en React.",
            },
        },
        {
            "segundo": 52,
            "tipo": "completacion",
            "pregunta": "Completa la sintaxis: el atributo que reemplaza a 'class' dentro de JSX se escribe ________.",
            "config": {
                "respuestasAceptadas": ["className", "classname"],
                "pista": "Usa camelCase y empieza con 'class...'",
                "explicacion": "En JSX se usa className porque class es una palabra reservada de JavaScript.",
            },
        },
    ],
    103: [
        {
            "segundo": 28,
            "tipo": "multiple_respuesta",
            "pregunta": "¿Cuáles de las siguientes afirmaciones sobre las props en React son correctas?",
            "config": {
                "opciones": [
                    "Pasan datos desde un componente padre hacia un hijo",
                    "Son de solo lectura dentro del componente hijo",
                    "Se pueden modificar directamente con props.titulo = 'nuevo'",
                    "Pueden transportar texto, números, objetos o funciones",
                ],
                "correctas": [0, 1, 3],
                "explicacion": "Las props fluyen del padre al hijo, son inmutables (solo lectura) y aceptan cualquier tipo de valor JS.",
            },
        },
        {
            "segundo": 48,
            "tipo": "desarrollo",
            "pregunta": "Explica con tus propias palabras cuál es la diferencia entre props y estado (state) en React.",
            "config": {
                "palabrasClave": ["props", "estado", "padre", "cambia", "lectura"],
                "minPalabras": 8,
                "pista": "Menciona cómo llegan los datos (padre/props) y qué permite el estado cuando algo cambia.",
                "explicacion": "Excelente: las props llegan desde el padre y son de solo lectura, mientras que el estado pertenece al componente y cambia con la interacción.",
            },
        },
    ],
}


def seed_database(db: Session) -> None:
    """Si la base de datos está vacía, carga usuarios demo, los 6 cursos y la semilla de Diego."""
    if db.query(Usuario).first() is not None:
        return

    # 1. Crear los 3 perfiles demo (admin_general, profesor, estudiante)
    admin = Usuario(
        username="admin",
        email="admin@anden.urbe.edu",
        nombre="Administrador General",
        primer_nombre="Admin",
        iniciales="AG",
        password_hash=hash_password("1234"),
        rol="admin_general",
        activo=True,
    )
    db.add(admin)
    db.flush()

    profe = Usuario(
        username="profe",
        email="profesor@anden.urbe.edu",
        nombre="Prof. Andrés Carvajal",
        primer_nombre="Andrés",
        iniciales="AC",
        password_hash=hash_password("1234"),
        rol="profesor",
        activo=True,
        creado_por_id=admin.id,
    )
    diego = Usuario(
        username="diego",
        email="diego@anden.urbe.edu",
        nombre="Diego Cardozo",
        primer_nombre="Diego",
        iniciales=extraer_iniciales("Diego Cardozo"),
        password_hash=hash_password("1234"),
        rol="estudiante",
        activo=True,
    )
    db.add_all([profe, diego])
    db.flush()

    # 2. Cargar cursos, módulos, lecciones y preguntas desde src/data/cursos.json
    cursos_path = PROJECT_ROOT / "src" / "data" / "cursos.json"
    cursos_raw = json.loads(cursos_path.read_text(encoding="utf-8"))

    # Primero crear cursos sin prelación para evitar conflictos de orden de FK
    for idx, c in enumerate(cursos_raw, start=1):
        cid = int(c["id"])
        cfg = CONFIG_CURSOS_SEED.get(cid, {"tipo_acceso": "gratis", "precio": 0.0, "umbral": 70, "prereq": None})
        curso = Curso(
            id=cid,
            titulo=c["titulo"],
            categoria=c.get("categoria", "Programación"),
            nivel=c.get("nivel", "Principiante"),
            descripcion=c.get("descripcion", ""),
            color=c.get("color", "#2f6f73"),
            tipo_acceso=cfg["tipo_acceso"],
            precio=cfg["precio"],
            umbral_certificado=cfg["umbral"],
            prerequisito_curso_id=None,
            orden=idx,
            creado_por_id=profe.id,
        )
        db.add(curso)
        db.flush()

        for m_idx, m in enumerate(c.get("modulos", []), start=1):
            modulo = Modulo(
                curso_id=curso.id,
                orden=m_idx,
                titulo=m["titulo"],
            )
            db.add(modulo)
            db.flush()

            for l_idx, l in enumerate(m.get("lecciones", []), start=1):
                lid = int(l["id"])
                leccion = Leccion(
                    id=lid,
                    modulo_id=modulo.id,
                    orden=l_idx,
                    titulo=l["titulo"],
                    duracion=int(l.get("duracion", 60)),
                    video_url=l.get("video", "/videos/101.mp4"),
                )
                db.add(leccion)
                db.flush()

                for q in l.get("cuestionarios", []):
                    q_cfg = {
                        "opciones": q.get("opciones", []),
                        "correcta": int(q.get("correcta", 0)),
                        "explicacion": q.get("explicacion", ""),
                    }
                    preg = Pregunta(
                        id=int(q["id"]),
                        leccion_id=leccion.id,
                        segundo=int(q.get("segundo", 20)),
                        tipo=q.get("tipo", "opcion_unica"),
                        pregunta=q["pregunta"],
                        config_json=json.dumps(q_cfg, ensure_ascii=False),
                    )
                    db.add(preg)

                # Agregar las preguntas variadas de muestra si corresponden a esta lección
                for extra in PREGUNTAS_VARIADAS_SEED.get(lid, []):
                    db.add(
                        Pregunta(
                            leccion_id=leccion.id,
                            segundo=extra["segundo"],
                            tipo=extra["tipo"],
                            pregunta=extra["pregunta"],
                            config_json=json.dumps(extra["config"], ensure_ascii=False),
                        )
                    )

    db.flush()

    # Asignar prelaciones opcionales después de insertar todos los cursos
    for cid, cfg in CONFIG_CURSOS_SEED.items():
        if cfg.get("prereq"):
            curso = db.get(Curso, cid)
            if curso:
                curso.prerequisito_curso_id = cfg["prereq"]

    # 3. Permiso pre-aprobado para Diego en Curso 3 (Diseño de interfaces, restringido pero ya empezado en semilla)
    db.add(
        InscripcionAcceso(
            usuario_id=diego.id,
            curso_id=3,
            estado="aprobado",
            metodo="admin",
            mensaje_solicitud="Acceso inicial del estudiante de prueba",
            aprobado_por_id=admin.id,
        )
    )

    # 4. Progreso inicial de Diego desde src/data/usuario.json
    cargar_semilla_progreso_diego(db, diego)

    db.commit()


def cargar_semilla_progreso_diego(db: Session, diego: Usuario) -> None:
    """Aplica el progreso inicial de Diego (idempotente tras limpiar su progreso)."""
    usuario_path = PROJECT_ROOT / "src" / "data" / "usuario.json"
    u_raw = json.loads(usuario_path.read_text(encoding="utf-8"))
    prog_raw = u_raw.get("progreso", {})
    ultima = prog_raw.get("ultimaLeccion") or {}

    pu = ProgresoUsuario(
        usuario_id=diego.id,
        xp=int(prog_raw.get("xp", 2340)),
        ultima_curso_id=ultima.get("cursoId", 1),
        ultima_leccion_id=ultima.get("leccionId", 102),
        racha_aciertos_actual=10,
        mejor_racha_aciertos=10,
    )
    db.add(pu)

    now = datetime.now(timezone.utc)
    for lid_str, datos_l in (prog_raw.get("lecciones") or {}).items():
        lid = int(lid_str)
        leccion = db.get(Leccion, lid)
        if not leccion:
            continue
        completada = bool(datos_l.get("completada"))
        db.add(
            ProgresoLeccion(
                usuario_id=diego.id,
                leccion_id=lid,
                maximo=int(datos_l.get("maximo", 0)),
                completada=completada,
                completada_en=now if completada else None,
            )
        )
        # Sembrar respuestas reales para las lecciones ya completadas (así el % de aciertos y certificado de PHP funcionan de una vez)
        if completada:
            curso_id = leccion.modulo.curso_id
            for idx_q, preg in enumerate(leccion.preguntas):
                primer_intento = (idx_q % 5) != 4  # ~85-90% al 1er intento
                db.add(
                    RespuestaUsuario(
                        usuario_id=diego.id,
                        pregunta_id=preg.id,
                        leccion_id=leccion.id,
                        curso_id=curso_id,
                        intentos=1 if primer_intento else 2,
                        acertada_primer_intento=primer_intento,
                        puntaje=1.0 if primer_intento else 0.65,
                        respuesta_json=json.dumps({"semilla": True}),
                    )
                )

    # Sembrar 12 días consecutivos de actividad real terminando hoy (coincide con diasSeguidos: 12)
    hoy = date.today()
    for offset in range(12):
        f_iso = (hoy - timedelta(days=offset)).isoformat()
        db.add(ActividadDiaria(usuario_id=diego.id, fecha=f_iso))

    db.flush()
    # Calcular logros y emitir certificado automático de PHP desde cero (curso 2 completado)
    cursos = db.query(Curso).order_by(Curso.orden, Curso.id).all()
    construir_estado_progreso(db, diego, cursos)
