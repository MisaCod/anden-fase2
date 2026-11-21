// Reglas del juego. Igual que progreso.js: funciones puras, sin React.
import { avanceDe, leccionesDe, preguntaRespondida, segundosVistos } from './progreso.js'

export const XP_LECCION = 50 // por completar una lección (una sola vez)
export const XP_CURSO = 150 // extra por terminar un curso
export const XP_POR_NIVEL = 300

// 20 XP si se acierta al primer intento, 5 si se acierta después
export function xpPorRespuesta(intento) {
  if (intento === 1) return 20
  return 5
}

// El XP se guarda; el nivel se calcula. De 0 a 299 XP es nivel 1, de 300 a 599 nivel 2...
export function nivelDe(xp) {
  return Math.floor(xp / XP_POR_NIVEL) + 1
}

// Todo lo que muestran el header y Mi progreso, calculado a partir del progreso
export function calcularResumen(cursos, progreso) {
  let leccionesCompletadas = 0
  let preguntasAcertadas = 0
  let segundos = 0

  for (const curso of cursos) {
    for (const leccion of leccionesDe(curso)) {
      if (avanceDe(progreso, leccion.id).completada) leccionesCompletadas++
      segundos += segundosVistos(leccion, progreso)

      for (const pregunta of leccion.cuestionarios) {
        if (preguntaRespondida(pregunta, leccion, progreso)) preguntasAcertadas++
      }
    }
  }

  const xpEnNivel = progreso.xp % XP_POR_NIVEL
  return {
    nivel: nivelDe(progreso.xp),
    xpEnNivel: xpEnNivel,
    faltan: XP_POR_NIVEL - xpEnNivel,
    leccionesCompletadas: leccionesCompletadas,
    preguntasAcertadas: preguntasAcertadas,
    minutos: Math.floor(segundos / 60),
  }
}
