import { createContext, useContext, useEffect, useState } from 'react'
import { useCursos } from './CursosContext.jsx'
import usuario from '../data/usuario.json'
import { calcularResumen, xpPorRespuesta, XP_CURSO, XP_LECCION } from '../logica/gamificacion.js'
import { avanceDe, cursoTerminado, siguienteLeccion } from '../logica/progreso.js'

// El progreso es como $_SESSION: lo ven todas las páginas.
// Además se guarda en el equipo (localStorage) para no perderlo al recargar.
const ProgresoContext = createContext(null)

const CLAVE = 'anden-progreso'
const semilla = usuario.progreso // el progreso inicial que "devuelve el servidor"

// Lee lo guardado en este equipo. Si no hay nada o está dañado, usa la semilla
function leerGuardado() {
  try {
    const texto = localStorage.getItem(CLAVE)
    if (texto === null) return semilla
    return { ...semilla, ...JSON.parse(texto) } // lo guardado pisa a la semilla; lo que le falte queda de la semilla
  } catch (error) {
    return semilla
  }
}

export function ProgresoProvider({ children }) {
  const { cursos } = useCursos()
  // La función que recibe useState se ejecuta solo la primera vez
  const [progreso, setProgreso] = useState(leerGuardado)

  // Después de cada cambio del progreso, se guarda en el equipo
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(progreso))
    } catch (error) {
      // Si el navegador no deja guardar (por ejemplo en modo privado), la app sigue igual
    }
  }, [progreso])

  // Puerta para cambiar una parte del progreso: copia el anterior, cambia la copia y la devuelve.
  // Así nunca se modifica el estado directamente ni se trabaja con un progreso viejo
  function cambiarProgreso(cambio) {
    setProgreso((anterior) => {
      const copia = structuredClone(anterior)
      cambio(copia)
      return copia
    })
  }

  // Guarda el segundo más lejano que se vio de una lección
  function guardarAvance(cursoId, leccionId, segundo) {
    cambiarProgreso((p) => {
      const avance = avanceDe(p, leccionId)
      p.lecciones[leccionId] = {
        maximo: Math.max(avance.maximo, segundo),
        completada: avance.completada,
      }
      p.ultimaLeccion = { cursoId: cursoId, leccionId: leccionId }
    })
  }

  // Solo las respuestas correctas se guardan y suman XP, una vez por pregunta
  function responder(pregunta, opcion, intento) {
    if (opcion !== pregunta.correcta) return
    cambiarProgreso((p) => {
      if (p.respuestas[pregunta.id]) return
      p.respuestas[pregunta.id] = { intentos: intento }
      p.xp += xpPorRespuesta(intento)
    })
  }

  // Marca la lección como completada (una sola vez) y suma el XP de la lección y del curso
  function completarLeccion(curso, leccion) {
    cambiarProgreso((p) => {
      if (avanceDe(p, leccion.id).completada) return
      p.lecciones[leccion.id] = { maximo: leccion.duracion, completada: true }
      p.xp += XP_LECCION
      if (cursoTerminado(curso, p)) p.xp += XP_CURSO

      const siguiente = siguienteLeccion(curso, leccion)
      if (siguiente) p.ultimaLeccion = { cursoId: curso.id, leccionId: siguiente.id }
    })
  }

  // Reiniciar no usa cambiarProgreso: no cambia una parte, reemplaza todo por la semilla.
  // No hace falta copiarla porque nadie la modifica: los cambios siempre se hacen sobre una copia
  function reiniciar() {
    if (window.confirm('¿Reiniciar tu progreso? Se borra lo guardado en este equipo y vuelves al punto de partida.')) {
      setProgreso(semilla)
    }
  }

  // Nivel, XP del nivel y estadísticas: se calculan, no se guardan
  const resumen = calcularResumen(cursos, progreso)

  return (
    <ProgresoContext.Provider
      value={{ progreso, resumen, guardarAvance, responder, completarLeccion, reiniciar }}
    >
      {children}
    </ProgresoContext.Provider>
  )
}

// Atajo para usar el progreso en cualquier componente
export function useProgreso() {
  return useContext(ProgresoContext)
}
