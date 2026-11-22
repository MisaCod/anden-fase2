import json
import math
import re
import unicodedata
from typing import Any

TIPOS_PREGUNTA = (
    "opcion_unica",
    "verdadero_falso",
    "multiple_respuesta",
    "completacion",
    "desarrollo",
)


def normalizar_texto(texto: str) -> str:
    """Quita tildes, puntuación sobrante, mayúsculas y espacios repetidos."""
    if not texto:
        return ""
    sin_tildes = "".join(
        ch for ch in unicodedata.normalize("NFKD", str(texto)) if not unicodedata.combining(ch)
    )
    limpio = re.sub(r"[^a-zA-Z0-9\s]", " ", sin_tildes.lower())
    return re.sub(r"\s+", " ", limpio).strip()


def parsear_config(config_json: str) -> dict[str, Any]:
    try:
        data = json.loads(config_json or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def serializar_pregunta(pregunta_obj) -> dict[str, Any]:
    """Convierte el modelo SQLAlchemy Pregunta al formato enriquecido del API."""
    cfg = parsear_config(pregunta_obj.config_json)
    tipo = pregunta_obj.tipo or "opcion_unica"

    base = {
        "id": pregunta_obj.id,
        "segundo": int(pregunta_obj.segundo or 0),
        "tipo": tipo,
        "pregunta": pregunta_obj.pregunta,
        "explicacion": cfg.get("explicacion", ""),
    }

    if tipo == "opcion_unica":
        base["opciones"] = cfg.get("opciones", [])
        base["correcta"] = int(cfg.get("correcta", 0))
    elif tipo == "verdadero_falso":
        base["opciones"] = cfg.get("opciones", ["Verdadero", "Falso"])
        base["correcta"] = int(cfg.get("correcta", 0))
    elif tipo == "multiple_respuesta":
        base["opciones"] = cfg.get("opciones", [])
        base["correctas"] = sorted(int(i) for i in cfg.get("correctas", []))
    elif tipo == "completacion":
        base["respuestasAceptadas"] = cfg.get("respuestasAceptadas", [])
        base["pista"] = cfg.get("pista", "")
    elif tipo == "desarrollo":
        base["palabrasClave"] = cfg.get("palabrasClave", [])
        base["minPalabras"] = int(cfg.get("minPalabras", 8))
        base["pista"] = cfg.get("pista", "")

    return base


def puntaje_por_intento(intento: int) -> float:
    if intento <= 1:
        return 1.0
    if intento == 2:
        return 0.65
    return 0.35


def evaluar_respuesta(pregunta_obj, respuesta_payload: Any, intento: int = 1) -> dict[str, Any]:
    """
    Evalúa la respuesta del estudiante en el servidor para cualquiera de los 5 tipos.
    Retorna: { correcta: bool, puntaje: float, mensaje: str, detalles: dict }
    """
    cfg = parsear_config(pregunta_obj.config_json)
    tipo = pregunta_obj.tipo or "opcion_unica"
    explicacion = (cfg.get("explicacion") or "").strip()
    intento = max(1, int(intento or 1))

    if tipo == "opcion_unica":
        correcta_idx = int(cfg.get("correcta", 0))
        try:
            elegida = int(respuesta_payload)
        except Exception:
            return {"correcta": False, "puntaje": 0.0, "mensaje": "Selecciona una opción válida.", "detalles": {}}
        ok = elegida == correcta_idx
        if ok:
            msg = f"¡Correcto! {explicacion}".strip()
            return {"correcta": True, "puntaje": puntaje_por_intento(intento), "mensaje": msg, "detalles": {"correcta": correcta_idx}}
        return {"correcta": False, "puntaje": 0.0, "mensaje": "No es correcta. Intenta con otra opción.", "detalles": {}}

    if tipo == "verdadero_falso":
        correcta_idx = int(cfg.get("correcta", 0))
        if isinstance(respuesta_payload, bool):
            elegida = 0 if respuesta_payload else 1
        else:
            try:
                elegida = int(respuesta_payload)
            except Exception:
                return {"correcta": False, "puntaje": 0.0, "mensaje": "Elige Verdadero o Falso.", "detalles": {}}
        ok = elegida == correcta_idx
        if ok:
            msg = f"¡Correcto! {explicacion}".strip()
            return {"correcta": True, "puntaje": puntaje_por_intento(intento), "mensaje": msg, "detalles": {"correcta": correcta_idx}}
        return {"correcta": False, "puntaje": 0.0, "mensaje": "Incorrecto. Vuelve a intentarlo.", "detalles": {}}

    if tipo == "multiple_respuesta":
        correctas = sorted({int(i) for i in cfg.get("correctas", [])})
        if not isinstance(respuesta_payload, list) or len(respuesta_payload) == 0:
            return {"correcta": False, "puntaje": 0.0, "mensaje": "Marca al menos una opción.", "detalles": {}}
        try:
            elegidas = sorted({int(i) for i in respuesta_payload})
        except Exception:
            return {"correcta": False, "puntaje": 0.0, "mensaje": "Selección inválida.", "detalles": {}}
        if elegidas == correctas:
            msg = f"¡Excelente! Marcaste todas las opciones correctas. {explicacion}".strip()
            return {
                "correcta": True,
                "puntaje": puntaje_por_intento(intento),
                "mensaje": msg,
                "detalles": {"correctas": correctas},
            }
        faltan = len(set(correctas) - set(elegidas))
        sobran = len(set(elegidas) - set(correctas))
        if sobran > 0 and faltan > 0:
            pista = "Te faltó marcar alguna opción correcta y marcaste alguna incorrecta."
        elif sobran > 0:
            pista = "Marcaste al menos una opción que no corresponde."
        else:
            pista = "Vas bien, pero todavía te falta marcar otra opción correcta."
        return {
            "correcta": False,
            "puntaje": 0.0,
            "mensaje": f"{pista} Revisa e intenta de nuevo.",
            "detalles": {"faltan": faltan, "sobran": sobran},
        }

    if tipo == "completacion":
        aceptadas = [normalizar_texto(r) for r in cfg.get("respuestasAceptadas", []) if str(r).strip()]
        texto_usuario = normalizar_texto(str(respuesta_payload or ""))
        if not texto_usuario:
            return {"correcta": False, "puntaje": 0.0, "mensaje": "Escribe tu respuesta antes de enviar.", "detalles": {}}
        ok = texto_usuario in aceptadas if aceptadas else len(texto_usuario) >= 2
        if ok:
            msg = f"¡Correcto! {explicacion}".strip()
            return {"correcta": True, "puntaje": puntaje_por_intento(intento), "mensaje": msg, "detalles": {}}
        pista = (cfg.get("pista") or "").strip()
        extra = f" Pista: {pista}" if pista else ""
        return {
            "correcta": False,
            "puntaje": 0.0,
            "mensaje": f"No coincide con la respuesta esperada.{extra} Intenta de nuevo.",
            "detalles": {},
        }

    if tipo == "desarrollo":
        texto_raw = str(respuesta_payload or "").strip()
        texto_norm = normalizar_texto(texto_raw)
        palabras = [w for w in texto_norm.split() if w]
        min_palabras = max(3, int(cfg.get("minPalabras", 8)))
        claves = [str(k).strip() for k in cfg.get("palabrasClave", []) if str(k).strip()]

        if len(palabras) < min_palabras:
            return {
                "correcta": False,
                "puntaje": 0.0,
                "mensaje": f"Desarrolla un poco más tu respuesta (llevas {len(palabras)} de al menos {min_palabras} palabras).",
                "detalles": {"palabras": len(palabras), "minPalabras": min_palabras},
            }

        encontradas = []
        faltantes = []
        for k in claves:
            kn = normalizar_texto(k)
            if kn and kn in texto_norm:
                encontradas.append(k)
            elif kn:
                faltantes.append(k)

        if claves:
            minimo_claves = max(1, math.ceil(len(claves) * 0.5))
            if len(encontradas) < minimo_claves:
                sugerencia = ", ".join(faltantes[:3])
                return {
                    "correcta": False,
                    "puntaje": 0.0,
                    "mensaje": (
                        f"Buen avance, pero falta mencionar ideas clave ({len(encontradas)}/{minimo_claves} mínimas). "
                        f"Intenta explicar usando conceptos como: {sugerencia}."
                    ),
                    "detalles": {
                        "encontradas": encontradas,
                        "faltantes": faltantes,
                        "minimoRequerido": minimo_claves,
                    },
                }
            cobertura = len(encontradas) / len(claves)
            base_puntaje = 0.75 + 0.25 * cobertura
        else:
            base_puntaje = 1.0

        factor_intento = 1.0 if intento == 1 else (0.85 if intento == 2 else 0.75)
        puntaje_final = round(min(1.0, base_puntaje * factor_intento), 2)
        msg = f"¡Respuesta aprobada por auto-evaluación ({int(puntaje_final * 100)} %)! {explicacion}".strip()
        return {
            "correcta": True,
            "puntaje": puntaje_final,
            "mensaje": msg,
            "detalles": {
                "palabras": len(palabras),
                "encontradas": encontradas,
                "faltantes": faltantes,
            },
        }

    return {"correcta": False, "puntaje": 0.0, "mensaje": "Tipo de pregunta no soportado.", "detalles": {}}
