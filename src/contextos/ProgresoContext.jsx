import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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

/**
 * Evita que una respuesta tardía de /avance sobrescriba lecciones ya marcadas
 * como completadas o retroceda el segundo máximo visto.
 */
function fusionarAvanceSinRetroceso(anterior, nuevo) {
  if (!nuevo) return anterior
  const leccionesCombinadas = { ...(nuevo.lecciones || {}) }
  for (const [id, prevLecc] of Object.entries(anterior.lecciones || {})) {
    const nuevaLecc = leccionesCombinadas[id]
    if (!nuevaLecc) {
      leccionesCombinadas[id] = prevLecc
    } else if (prevLecc.completada && !nuevaLecc.completada) {
      leccionesCombinadas[id] = {
        maximo: Math.max(prevLecc.maximo || 0, nuevaLecc.maximo || 0),
        completada: true,
      }
    } else {
      leccionesCombinadas[id] = {
        ...nuevaLecc,
        maximo: Math.max(prevLecc.maximo || 0, nuevaLecc.maximo || 0),
      }
    }
  }
  return {
    ...nuevo,
    xp: Math.max(anterior.xp || 0, nuevo.xp || 0),
    lecciones: leccionesCombinadas,
  }
}

export function ProgresoProvider({ children }) {
  const { estaAutenticado, usuarioActual } = useAuth()
  const { recargarCursos } = useCursos()
  const [estado, setEstado] = useState(ESTADO_VACIO)
  const [cargandoProgreso, setCargandoProgreso] = useState(false)
  // Contador monotónico para descartar respuestas viejas de guardarAvance frente a completarLeccion/responder
  const versionRef = useRef(0)

  const recargarProgreso = useCallback(async () => {
    if (!estaAutenticado) {
      setEstado(ESTADO_VACIO)
      return ESTADO_VACIO
    }
    const miVersion = ++versionRef.current
    setCargandoProgreso(true)
    try {
      const data = await apiFetch('/api/progreso')
      if (miVersion === versionRef.current) {
        setEstado(data || ESTADO_VACIO)
      }
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
      versionRef.current += 1
      setEstado(ESTADO_VACIO)
    }
  }, [estaAutenticado, usuarioActual?.id, recargarProgreso])

  const guardarAvance = useCallback((cursoId, leccionId, segundo, duracionReal = null) => {
    const miVersion = versionRef.current
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
            completada: Boolean(prevLecc.completada),
          },
        },
      }
    })

    const payload = { cursoId, leccionId, segundo }
    if (duracionReal && duracionReal > 0) {
      payload.duracionReal = Math.round(duracionReal)
    }

    apiFetch('/api/progreso/avance', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((nuevo) => {
        if (nuevo && miVersion === versionRef.current) {
          setEstado((prev) => fusionarAvanceSinRetroceso(prev, nuevo))
        }
      })
      .catch(() => {
        // Reintento silencioso en el siguiente segundo
      })
  }, [])

  const responder = useCallback(async (pregunta, respuesta, intento = 1, modoRepaso = false) => {
    versionRef.current += 1
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
      setEstado((prev) => fusionarAvanceSinRetroceso(prev, res.progreso))
    }
    return res
  }, [])

  const completarLeccion = useCallback(
    async (curso, leccion, duracionReal = null) => {
      // Invalida cualquier /avance en vuelo y marca completada optimistamente al instante
      versionRef.current += 1
      const durFinal = Math.max(Number(leccion.duracion) || 0, Math.round(duracionReal || 0))
      setEstado((prev) => ({
        ...prev,
        lecciones: {
          ...prev.lecciones,
          [leccion.id]: { maximo: durFinal, completada: true },
        },
      }))

      try {
        const payload = { cursoId: curso.id, leccionId: leccion.id }
        if (duracionReal && duracionReal > 0) {
          payload.duracionReal = Math.round(duracionReal)
        }
        const res = await apiFetch('/api/progreso/completar-leccion', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (res?.progreso) {
          setEstado(res.progreso)
        }
        // Recargar cursos por si cambió la duración real o se desbloqueó una prelación
        await recargarCursos()
        return res
      } catch {
        return null
      }
    },
    [recargarCursos]
  )

  const reiniciar = useCallback(async () => {
    versionRef.current += 1
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
