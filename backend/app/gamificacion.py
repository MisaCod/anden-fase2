from datetime import date, datetime, timedelta, timezone
import math
import uuid
from typing import Any
from sqlalchemy.orm import Session

from .models import (
    ActividadDiaria,
    Certificado,
    Curso,
    LogroUsuario,
    ProgresoLeccion,
    ProgresoUsuario,
    RespuestaUsuario,
    Usuario,
)

XP_LECCION = 50
XP_CURSO = 150
XP_POR_NIVEL = 300

MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

PALETA_CATEGORIAS = {
    "Programación": "#2f6f73",
    "Diseño": "#8e6c8a",
    "Datos": "#e59b34",
    "Backend": "#6a9c89",
    "Frontend": "#2f6f73",
}


def formatear_fecha_es(dt: datetime | None) -> str:
    if not dt:
        return ""
    return f"{dt.day} de {MESES_ES[dt.month - 1]} de {dt.year}"


def xp_por_respuesta(intento: int) -> int:
    return 20 if int(intento or 1) <= 1 else 5


def nivel_de(xp: int) -> int:
    return (max(0, int(xp or 0)) // XP_POR_NIVEL) + 1


def registrar_actividad_hoy(db: Session, usuario_id: int) -> None:
    hoy = date.today().isoformat()
    existe = (
        db.query(ActividadDiaria)
        .filter(ActividadDiaria.usuario_id == usuario_id, ActividadDiaria.fecha == hoy)
        .first()
    )
    if not existe:
        db.add(ActividadDiaria(usuario_id=usuario_id, fecha=hoy))


def calcular_racha_dias(fechas_iso: list[str]) -> int:
    """Cuenta cuántos días consecutivos de actividad lleva el estudiante hasta hoy (o ayer)."""
    if not fechas_iso:
        return 0
    fechas = sorted({date.fromisoformat(f) for f in fechas_iso}, reverse=True)
    hoy = date.today()
    if fechas[0] < hoy - timedelta(days=1):
        return 0
    racha = 1
    actual = fechas[0]
    for f in fechas[1:]:
        if f == actual - timedelta(days=1):
            racha += 1
            actual = f
        elif f < actual - timedelta(days=1):
            break
    return racha


def asegurar_progreso_usuario(db: Session, usuario_id: int) -> ProgresoUsuario:
    pu = db.get(ProgresoUsuario, usuario_id)
    if not pu:
        pu = ProgresoUsuario(usuario_id=usuario_id, xp=0, racha_aciertos_actual=0, mejor_racha_aciertos=0)
        db.add(pu)
        db.flush()
    return pu


def calcular_estadisticas_curso(
    curso: Curso,
    mapa_lecciones: dict[int, ProgresoLeccion],
    mapa_respuestas: dict[int, RespuestaUsuario],
) -> dict[str, Any]:
    lecciones = [l for m in curso.modulos for l in m.lecciones]
    total_duracion = sum(int(l.duracion or 0) for l in lecciones)
    segundos_vistos = 0
    lecciones_completadas = 0
    total_preguntas = 0
    preguntas_respondidas = 0
    suma_puntaje = 0.0
    aciertos_primer_intento = 0

    for l in lecciones:
        pl = mapa_lecciones.get(l.id)
        if pl and pl.completada:
            lecciones_completadas += 1
            segundos_vistos += int(l.duracion or 0)
        elif pl:
            segundos_vistos += min(int(pl.maximo or 0), int(l.duracion or 0))

        for p in l.preguntas:
            total_preguntas += 1
            resp = mapa_respuestas.get(p.id)
            if resp:
                preguntas_respondidas += 1
                suma_puntaje += float(resp.puntaje or 0.0)
                if resp.acertada_primer_intento:
                    aciertos_primer_intento += 1
            elif pl and pl.completada:
                # Si la lección fue completada históricamente sin registro de respuesta, cuenta como respondida base
                preguntas_respondidas += 1
                suma_puntaje += 0.85

    porcentaje_avance = math.floor((segundos_vistos / total_duracion) * 100) if total_duracion > 0 else 0
    completado = len(lecciones) > 0 and lecciones_completadas == len(lecciones)
    if completado:
        porcentaje_avance = 100

    empezado = segundos_vistos > 0 or lecciones_completadas > 0

    if preguntas_respondidas > 0:
        porcentaje_aciertos = round((suma_puntaje / preguntas_respondidas) * 100)
    elif completado and total_preguntas == 0:
        porcentaje_aciertos = 100
    else:
        porcentaje_aciertos = 0

    umbral = int(curso.umbral_certificado or 70)
    elegible_certificado = completado and porcentaje_aciertos >= umbral

    return {
        "cursoId": curso.id,
        "totalLecciones": len(lecciones),
        "leccionesCompletadas": lecciones_completadas,
        "porcentajeAvance": porcentaje_avance,
        "empezado": empezado,
        "completado": completado,
        "totalPreguntas": total_preguntas,
        "preguntasRespondidas": preguntas_respondidas,
        "aciertosPrimerIntento": aciertos_primer_intento,
        "porcentajeAciertos": porcentaje_aciertos,
        "umbralCertificado": umbral,
        "elegibleCertificado": elegible_certificado,
    }


def verificar_y_emitir_certificado(
    db: Session,
    usuario_id: int,
    curso: Curso,
    stats_curso: dict[str, Any],
) -> Certificado | None:
    """Emite o actualiza el certificado si el estudiante terminó el curso con nota >= umbral."""
    existente = (
        db.query(Certificado)
        .filter(Certificado.usuario_id == usuario_id, Certificado.curso_id == curso.id)
        .first()
    )
    if not stats_curso["elegibleCertificado"]:
        return existente

    if existente:
        if stats_curso["porcentajeAciertos"] > existente.porcentaje_aciertos:
            existente.porcentaje_aciertos = stats_curso["porcentajeAciertos"]
            db.flush()
        return existente

    codigo = f"ANDEN-{datetime.now(timezone.utc).year}-{uuid.uuid4().hex[:6].upper()}"
    cert = Certificado(
        codigo=codigo,
        usuario_id=usuario_id,
        curso_id=curso.id,
        porcentaje_aciertos=stats_curso["porcentajeAciertos"],
    )
    db.add(cert)
    db.flush()
    return cert


def calcular_arbol_habilidades(
    cursos: list[Curso],
    stats_por_curso: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Construye dinámicamente el árbol de habilidades agrupado por categoría.
    Cada curso (y/o sus módulos clave) avanza automáticamente de pendiente -> actual -> hecho.
    """
    grupos: dict[str, list[Curso]] = {}
    for c in cursos:
        cat = (c.categoria or "General").strip()
        grupos.setdefault(cat, []).append(c)

    ramas = []
    for cat, lista_cursos in grupos.items():
        color = lista_cursos[0].color or PALETA_CATEGORIAS.get(cat, "#2f6f73")
        nodos = []
        ya_hay_actual = False

        for c in lista_cursos:
            st = stats_por_curso.get(c.id, {})
            if st.get("completado"):
                estado = "hecho"
            elif st.get("empezado"):
                estado = "actual"
                ya_hay_actual = True
            else:
                estado = "pendiente"

            nodos.append(
                {
                    "cursoId": c.id,
                    "titulo": c.titulo,
                    "estado": estado,
                    "porcentaje": st.get("porcentajeAvance", 0),
                    "aciertos": st.get("porcentajeAciertos", 0),
                }
            )

        # Si ninguno está empezado pero tampoco todos hechos, el primero pendiente se marca como siguiente ('actual')
        if not ya_hay_actual:
            for n in nodos:
                if n["estado"] == "pendiente":
                    n["estado"] = "actual"
                    break

        ramas.append({"rama": cat, "color": color, "nodos": nodos})

    return ramas


def evaluar_logros(
    db: Session,
    usuario_id: int,
    cursos: list[Curso],
    pu: ProgresoUsuario,
    stats_por_curso: dict[int, dict[str, Any]],
    resumen: dict[str, Any],
    arbol: list[dict[str, Any]],
    total_certificados: int,
) -> list[dict[str, Any]]:
    """Evalúa en tiempo real todos los logros, persiste nuevos desbloqueos y devuelve la lista."""
    cursos_empezados = sum(1 for st in stats_por_curso.values() if st["empezado"])
    cursos_terminados = sum(1 for st in stats_por_curso.values() if st["completado"])
    nodos_totales = sum(len(r["nodos"]) for r in arbol)
    nodos_hechos = sum(1 for r in arbol for n in r["nodos"] if n["estado"] == "hecho")

    definiciones = [
        {
            "codigo": "primer_paso",
            "id": 1,
            "titulo": "Primer paso",
            "descripcion": "Completaste tu primera lección.",
            "icono": "★",
            "progreso": min(resumen["leccionesCompletadas"], 1),
            "meta": 1,
        },
        {
            "codigo": "una_semana",
            "id": 2,
            "titulo": "Una semana seguida",
            "descripcion": "Estudiaste siete días sin parar.",
            "icono": "▲",
            "progreso": min(resumen["diasSeguidos"], 7),
            "meta": 7,
        },
        {
            "codigo": "sin_fallar",
            "id": 3,
            "titulo": "Sin fallar",
            "descripcion": "Acertaste 10 preguntas seguidas al primer intento.",
            "icono": "✓",
            "progreso": min(int(pu.mejor_racha_aciertos or 0), 10),
            "meta": 10,
        },
        {
            "codigo": "fin_de_linea",
            "id": 4,
            "titulo": "Fin de línea",
            "descripcion": "Terminaste un curso completo.",
            "icono": "◆",
            "progreso": min(cursos_terminados, 1),
            "meta": 1,
        },
        {
            "codigo": "primer_certificado",
            "id": 5,
            "titulo": "Certificado obtenido",
            "descripcion": "Aprobaste un curso superando el porcentaje mínimo de aciertos.",
            "icono": "✪",
            "progreso": min(total_certificados, 1),
            "meta": 1,
        },
        {
            "codigo": "un_mes",
            "id": 6,
            "titulo": "Un mes seguido",
            "descripcion": "Estudia 30 días sin parar.",
            "icono": "●",
            "progreso": min(resumen["diasSeguidos"], 30),
            "meta": 30,
        },
        {
            "codigo": "explorador",
            "id": 7,
            "titulo": "Explorador",
            "descripcion": "Empieza 5 cursos distintos.",
            "icono": "✦",
            "progreso": min(cursos_empezados, 5),
            "meta": 5,
        },
        {
            "codigo": "nivel_10",
            "id": 8,
            "titulo": "Nivel 10",
            "descripcion": "Llega al nivel 10 acumulando experiencia.",
            "icono": "■",
            "progreso": min(resumen["nivel"], 10),
            "meta": 10,
        },
        {
            "codigo": "todas_las_ramas",
            "id": 9,
            "titulo": "Todas las ramas",
            "descripcion": "Completa todos los cursos del árbol de habilidades.",
            "icono": "♦",
            "progreso": min(nodos_hechos, max(1, nodos_totales)),
            "meta": max(1, nodos_totales),
        },
    ]

    guardados = {
        lu.logro_codigo: lu
        for lu in db.query(LogroUsuario).filter(LogroUsuario.usuario_id == usuario_id).all()
    }

    resultado = []
    cambio = False
    for d in definiciones:
        cumplido = d["progreso"] >= d["meta"]
        registro = guardados.get(d["codigo"])
        if cumplido and not registro:
            registro = LogroUsuario(usuario_id=usuario_id, logro_codigo=d["codigo"])
            db.add(registro)
            guardados[d["codigo"]] = registro
            cambio = True

        desbloqueado = bool(registro) or cumplido
        fecha_txt = formatear_fecha_es(registro.desbloqueado_en) if registro and registro.desbloqueado_en else (
            formatear_fecha_es(datetime.now(timezone.utc)) if cumplido else None
        )
        resultado.append(
            {
                "id": d["id"],
                "codigo": d["codigo"],
                "titulo": d["titulo"],
                "descripcion": d["descripcion"],
                "icono": d["icono"],
                "desbloqueado": desbloqueado,
                "fecha": fecha_txt,
                "progreso": d["meta"] if desbloqueado else d["progreso"],
                "meta": d["meta"],
            }
        )

    if cambio:
        db.flush()
    return resultado


def construir_estado_progreso(db: Session, usuario: Usuario, cursos: list[Curso]) -> dict[str, Any]:
    """Devuelve todo el estado consolidado del estudiante: progreso, resumen, aciertos, árbol, logros y certificados."""
    pu = asegurar_progreso_usuario(db, usuario.id)
    progresos_l = db.query(ProgresoLeccion).filter(ProgresoLeccion.usuario_id == usuario.id).all()
    respuestas = db.query(RespuestaUsuario).filter(RespuestaUsuario.usuario_id == usuario.id).all()
    actividades = db.query(ActividadDiaria).filter(ActividadDiaria.usuario_id == usuario.id).all()

    mapa_lecciones = {pl.leccion_id: pl for pl in progresos_l}
    mapa_respuestas = {r.pregunta_id: r for r in respuestas}

    stats_por_curso: dict[int, dict[str, Any]] = {}
    lecciones_completadas_total = 0
    preguntas_acertadas_total = 0
    segundos_totales = 0
    suma_puntaje_global = 0.0
    total_respuestas_global = 0

    for c in cursos:
        st = calcular_estadisticas_curso(c, mapa_lecciones, mapa_respuestas)
        stats_por_curso[c.id] = st
        lecciones_completadas_total += st["leccionesCompletadas"]
        preguntas_acertadas_total += st["preguntasRespondidas"]
        for m in c.modulos:
            for l in m.lecciones:
                pl = mapa_lecciones.get(l.id)
                if pl and pl.completada:
                    segundos_totales += int(l.duracion or 0)
                elif pl:
                    segundos_totales += min(int(pl.maximo or 0), int(l.duracion or 0))
        if st["elegibleCertificado"]:
            verificar_y_emitir_certificado(db, usuario.id, c, st)

    for r in respuestas:
        suma_puntaje_global += float(r.puntaje or 0.0)
        total_respuestas_global += 1

    porcentaje_aciertos_global = (
        round((suma_puntaje_global / total_respuestas_global) * 100)
        if total_respuestas_global > 0
        else 0
    )

    dias_seguidos = calcular_racha_dias([a.fecha for a in actividades])
    xp_total = int(pu.xp or 0)
    xp_en_nivel = xp_total % XP_POR_NIVEL

    resumen = {
        "xp": xp_total,
        "nivel": nivel_de(xp_total),
        "xpEnNivel": xp_en_nivel,
        "faltan": XP_POR_NIVEL - xp_en_nivel,
        "leccionesCompletadas": lecciones_completadas_total,
        "preguntasAcertadas": preguntas_acertadas_total,
        "porcentajeAciertosGlobal": porcentaje_aciertos_global,
        "minutos": segundos_totales // 60,
        "diasSeguidos": dias_seguidos,
        "rachaAciertosActual": int(pu.racha_aciertos_actual or 0),
        "mejorRachaAciertos": int(pu.mejor_racha_aciertos or 0),
    }

    certs_db = db.query(Certificado).filter(Certificado.usuario_id == usuario.id).all()
    mapa_cursos = {c.id: c for c in cursos}
    certificados = []
    for cert in certs_db:
        c = mapa_cursos.get(cert.curso_id)
        if c:
            certificados.append(
                {
                    "id": cert.id,
                    "codigo": cert.codigo,
                    "cursoId": cert.curso_id,
                    "cursoTitulo": c.titulo,
                    "cursoCategoria": c.categoria,
                    "cursoColor": c.color,
                    "estudianteNombre": usuario.nombre,
                    "porcentajeAciertos": cert.porcentaje_aciertos,
                    "umbralCertificado": c.umbral_certificado,
                    "emitidoEn": formatear_fecha_es(cert.emitido_en),
                    "emitidoIso": cert.emitido_en.isoformat() if cert.emitido_en else None,
                }
            )

    arbol = calcular_arbol_habilidades(cursos, stats_por_curso)
    logros = evaluar_logros(db, usuario.id, cursos, pu, stats_por_curso, resumen, arbol, len(certificados))

    lecciones_dict = {
        str(pl.leccion_id): {"maximo": int(pl.maximo or 0), "completada": bool(pl.completada)}
        for pl in progresos_l
    }
    respuestas_dict = {
        str(r.pregunta_id): {
            "intentos": int(r.intentos or 1),
            "acertadaPrimerIntento": bool(r.acertada_primer_intento),
            "puntaje": float(r.puntaje or 0.0),
        }
        for r in respuestas
    }

    return {
        "xp": xp_total,
        "ultimaLeccion": (
            {"cursoId": pu.ultima_curso_id, "leccionId": pu.ultima_leccion_id}
            if pu.ultima_curso_id and pu.ultima_leccion_id
            else None
        ),
        "lecciones": lecciones_dict,
        "respuestas": respuestas_dict,
        "resumen": resumen,
        "estadisticasPorCurso": {str(k): v for k, v in stats_por_curso.items()},
        "habilidades": arbol,
        "logros": logros,
        "certificados": certificados,
    }
