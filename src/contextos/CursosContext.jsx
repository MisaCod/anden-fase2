import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { apiFetch } from '../servicios/api.js'

const CursosContext = createContext(null)

export function CursosProvider({ children }) {
  const { estaAutenticado, usuarioActual } = useAuth()
  const [cursos, setCursos] = useState([])
  const [cargandoCursos, setCargandoCursos] = useState(false)
  const [errorCursos, setErrorCursos] = useState('')

  const recargarCursos = useCallback(async () => {
    if (!estaAutenticado) {
      setCursos([])
      return []
    }
    setCargandoCursos(true)
    setErrorCursos('')
    try {
      const lista = await apiFetch('/api/cursos')
      setCursos(Array.isArray(lista) ? lista : [])
      return lista
    } catch (err) {
      setErrorCursos(err.message || 'Error al cargar cursos.')
      return []
    } finally {
      setCargandoCursos(false)
    }
  }, [estaAutenticado])

  useEffect(() => {
    if (estaAutenticado) {
      recargarCursos()
    } else {
      setCursos([])
    }
  }, [estaAutenticado, usuarioActual?.id, recargarCursos])

  async function agregarCurso(datos) {
    try {
      const creado = await apiFetch('/api/cursos', {
        method: 'POST',
        body: JSON.stringify(datos),
      })
      await recargarCursos()
      return { ok: true, curso: creado }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo crear el curso.' }
    }
  }

  async function editarCurso(cursoId, datos) {
    try {
      const actualizado = await apiFetch(`/api/cursos/${cursoId}`, {
        method: 'PUT',
        body: JSON.stringify(datos),
      })
      await recargarCursos()
      return { ok: true, curso: actualizado }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo actualizar el curso.' }
    }
  }

  async function eliminarCurso(cursoId) {
    try {
      await apiFetch(`/api/cursos/${cursoId}`, { method: 'DELETE' })
      await recargarCursos()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo eliminar el curso.' }
    }
  }

  async function actualizarVideoLeccion(cursoId, leccionId, videoUrl, nuevaDuracion, nuevosCuestionarios) {
    try {
      const res = await apiFetch(`/api/lecciones/${leccionId}`, {
        method: 'PUT',
        body: JSON.stringify({
          video: videoUrl || null,
          duracion: nuevaDuracion ? Number(nuevaDuracion) : null,
          cuestionarios: nuevosCuestionarios || [],
        }),
      })
      await recargarCursos()
      return { ok: true, curso: res.curso }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo guardar el video y sus checkpoints.' }
    }
  }

  async function agregarLeccionConVideo(cursoId, moduloId, datosLeccion) {
    try {
      const res = await apiFetch(`/api/cursos/${cursoId}/lecciones`, {
        method: 'POST',
        body: JSON.stringify({
          moduloId: moduloId || null,
          titulo: datosLeccion.titulo,
          duracion: Number(datosLeccion.duracion) || 60,
          video: datosLeccion.video || '/videos/101.mp4',
          cuestionarios: datosLeccion.cuestionarios || [],
        }),
      })
      await recargarCursos()
      return { ok: true, curso: res.curso, leccionId: res.leccionId }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo crear la lección.' }
    }
  }

  async function solicitarAccesoCurso(cursoId, mensaje) {
    try {
      const res = await apiFetch(`/api/cursos/${cursoId}/solicitar-acceso`, {
        method: 'POST',
        body: JSON.stringify({ mensaje }),
      })
      await recargarCursos()
      return { ok: true, ...res }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo enviar la solicitud.' }
    }
  }

  async function pagarCursoSimulado(cursoId, { metodoPago, titular }) {
    try {
      const res = await apiFetch(`/api/cursos/${cursoId}/pagar-simulado`, {
        method: 'POST',
        body: JSON.stringify({ metodoPago, titular }),
      })
      await recargarCursos()
      return { ok: true, ...res }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo procesar el pago simulado.' }
    }
  }

  async function valorarLeccion(leccionId, puntuacion) {
    try {
      const res = await apiFetch(`/api/lecciones/${leccionId}/valorar`, {
        method: 'POST',
        body: JSON.stringify({ puntuacion }),
      })
      setCursos((prev) =>
        prev.map((c) => {
          if (c.id !== res.cursoId) return c
          return {
            ...c,
            valoracionPromedio: res.curso?.valoracionPromedio ?? c.valoracionPromedio,
            totalValoraciones: res.curso?.totalValoraciones ?? c.totalValoraciones,
            videosValorados: res.curso?.videosValorados ?? c.videosValorados,
            modulos: c.modulos.map((m) => ({
              ...m,
              lecciones: m.lecciones.map((l) =>
                l.id === leccionId
                  ? {
                      ...l,
                      valoracionPromedio: res.leccion?.valoracionPromedio ?? l.valoracionPromedio,
                      totalValoraciones: res.leccion?.totalValoraciones ?? l.totalValoraciones,
                      miValoracion: res.leccion?.miValoracion ?? puntuacion,
                    }
                  : l
              ),
            })),
          }
        })
      )
      return { ok: true, ...res }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo guardar la valoración.' }
    }
  }

  return (
    <CursosContext.Provider
      value={{
        cursos,
        cargandoCursos,
        errorCursos,
        recargarCursos,
        agregarCurso,
        editarCurso,
        eliminarCurso,
        actualizarVideoLeccion,
        agregarLeccionConVideo,
        solicitarAccesoCurso,
        pagarCursoSimulado,
        valorarLeccion,
      }}
    >
      {children}
    </CursosContext.Provider>
  )
}

export function useCursos() {
  const contexto = useContext(CursosContext)
  if (!contexto) {
    throw new Error('useCursos debe usarse dentro de un CursosProvider')
  }
  return contexto
}
