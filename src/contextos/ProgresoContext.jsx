import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useCursos } from './CursosContext.jsx'
import { apiFetch } from '../servicios/api.js'

const ProgresoContext = createContext(null)

const ESTADO_VACIO = {
  xp: 0,
  ultimaLeccion: null,
  lecciones: {},
  respuestas: {},
  resumen: {
    xp: 0,
    nivel: 1,
    xpEnNivel: 0,
    faltan: 300,
    leccionesCompletadas: 0,
    preguntasAcertadas: 0,
    porcentajeAciertosGlobal: 0,
    minutos: 0,
    diasSeguidos: 0,
    rachaAciertosActual: 0,
    mejorRachaAciertos: 0,
  },
  estadisticasPorCurso: {},
  habilidades: [],
  logros: [],
  certificados: [],
}

export function ProgresoProvider({ children }) {
  const { estaAutenticado, usuarioActual } = useAuth()
  const { recargarCursos } = useCursos()
  const [estado, setEstado] = useState(ESTADO_VACIO)
  const [cargandoProgreso, setCargandoProgreso] = useState(false)

  const recargarProgreso = useCallback(async () => {
    if (!estaAutenticado) {
      setEstado(ESTADO_VACIO)
      return ESTADO_VACIO
    }
    setCargandoProgreso(true)
    try {
      const data = await apiFetch('/api/progreso')
      setEstado(data || ESTADO_VACIO)
      return data
    } catch {
      return ESTADO_VACIO
    } finally {
      setCargandoProgreso(false)
    }
  }, [estaAutenticado])

  useEffect(() => {
    if (estaAutenticado) {
      recargarProgreso()
    } else {
      setEstado(ESTADO_VACIO)
    }
  }, [estaAutenticado, usuarioActual?.id, recargarProgreso])

  const guardarAvance = useCallback((cursoId, leccionId, segundo) => {
    // Actualización optimista inmediata para fluidez del reproductor
    setEstado((prev) => {
      const prevLecc = prev.lecciones[leccionId] || { maximo: 0, completada: false }
      return {
        ...prev,
        ultimaLeccion: { cursoId, leccionId },
        lecciones: {
          ...prev.lecciones,
          [leccionId]: {
            maximo: Math.max(prevLecc.maximo || 0, segundo),
            completada: prevLecc.completada,
          },
        },
      }
    })

    apiFetch('/api/progreso/avance', {
      method: 'POST',
      body: JSON.stringify({ cursoId, leccionId, segundo }),
    })
      .then((nuevo) => {
        if (nuevo) setEstado(nuevo)
      })
      .catch(() => {
        // Reintento silencioso en el siguiente segundo
      })
  }, [])

  const responder = useCallback(async (pregunta, respuesta, intento = 1, modoRepaso = false) => {
    const res = await apiFetch('/api/progreso/responder', {
      method: 'POST',
      body: JSON.stringify({
        preguntaId: pregunta.id,
        respuesta,
        intento,
        modoRepaso,
      }),
    })
    if (res?.progreso) {
      setEstado(res.progreso)
    }
    return res
  }, [])

  const completarLeccion = useCallback(
    async (curso, leccion) => {
      try {
        const res = await apiFetch('/api/progreso/completar-leccion', {
          method: 'POST',
          body: JSON.stringify({ cursoId: curso.id, leccionId: leccion.id }),
        })
        if (res?.progreso) {
          setEstado(res.progreso)
        }
        // Recargar cursos por si se desbloqueó una prelación de otro curso
        await recargarCursos()
        return res
      } catch {
        return null
      }
    },
    [recargarCursos]
  )

  const reiniciar = useCallback(async () => {
    try {
      const nuevo = await apiFetch('/api/progreso/reiniciar', { method: 'POST' })
      if (nuevo) setEstado(nuevo)
      await recargarCursos()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo reiniciar el progreso.' }
    }
  }, [recargarCursos])

  const progreso = {
    xp: estado.xp,
    ultimaLeccion: estado.ultimaLeccion,
    lecciones: estado.lecciones,
    respuestas: estado.respuestas,
  }

  return (
    <ProgresoContext.Provider
      value={{
        progreso,
        resumen: estado.resumen,
        estadisticasPorCurso: estado.estadisticasPorCurso || {},
        habilidades: estado.habilidades || [],
        logros: estado.logros || [],
        certificados: estado.certificados || [],
        cargandoProgreso,
        recargarProgreso,
        guardarAvance,
        responder,
        completarLeccion,
        reiniciar,
      }}
    >
      {children}
    </ProgresoContext.Provider>
  )
}

export function useProgreso() {
  return useContext(ProgresoContext)
}
