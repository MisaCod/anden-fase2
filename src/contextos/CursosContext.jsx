import { createContext, useContext, useState, useEffect } from 'react'
import cursosIniciales from '../data/cursos.json'

const CursosContext = createContext(null)
const CLAVE_CURSOS = 'anden-cursos'

function leerCursosGuardados() {
  try {
    const texto = localStorage.getItem(CLAVE_CURSOS)
    if (!texto) return cursosIniciales
    const parseados = JSON.parse(texto)
    if (Array.isArray(parseados) && parseados.length > 0) {
      return parseados
    }
    return cursosIniciales
  } catch (error) {
    return cursosIniciales
  }
}

export function CursosProvider({ children }) {
  const [cursos, setCursos] = useState(leerCursosGuardados)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_CURSOS, JSON.stringify(cursos))
    } catch (error) {
      // Ignorar si el almacenamiento local está deshabilitado
    }
  }, [cursos])

  function agregarCurso(datos) {
    const titulo = (datos.titulo || '').trim()
    const descripcion = (datos.descripcion || '').trim()
    const categoria = (datos.categoria || 'Programación').trim()
    const nivel = (datos.nivel || 'Principiante').trim()
    const color = (datos.color || '#2f6f73').trim()

    if (!titulo) {
      return { ok: false, error: 'El título del curso es obligatorio.' }
    }
    if (titulo.length > 40) {
      return { ok: false, error: 'El título del curso no puede superar los 40 caracteres.' }
    }
    if (!descripcion) {
      return { ok: false, error: 'La descripción del curso es obligatoria.' }
    }
    if (descripcion.length > 200) {
      return { ok: false, error: 'La descripción del curso no puede superar los 200 caracteres.' }
    }

    const maxId = cursos.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0)
    const nuevoId = maxId + 1

    let modulosFinales = []
    if (Array.isArray(datos.modulos) && datos.modulos.length > 0) {
      modulosFinales = datos.modulos.map((m, mIdx) => ({
        id: m.id || mIdx + 1,
        titulo: (m.titulo || `Módulo ${mIdx + 1}: Tema`).trim(),
        lecciones: (m.lecciones && m.lecciones.length > 0 ? m.lecciones : [
          {
            titulo: '101. Introducción',
            duracion: 60,
          }
        ]).map((l, lIdx) => ({
          id: l.id || nuevoId * 100 + (mIdx + 1) * 10 + (lIdx + 1),
          titulo: (l.titulo || `Lección ${lIdx + 1}`).trim(),
          duracion: Math.max(10, Number(l.duracion) || 60),
          video: l.video || '/videos/101.mp4',
          cuestionarios: l.cuestionarios || [],
        })),
      }))
    } else {
      const moduloTitulo = (datos.moduloTitulo || 'Módulo 1: Fundamentos').trim()
      const leccionTitulo = (datos.leccionTitulo || '101. Introducción al curso').trim()
      const leccionDuracion = Math.max(10, Number(datos.leccionDuracion) || 60)
      const leccionVideo = datos.leccionVideo || '/videos/101.mp4'

      modulosFinales = [
        {
          id: 1,
          titulo: moduloTitulo,
          lecciones: [
            {
              id: nuevoId * 100 + 1,
              titulo: leccionTitulo,
              duracion: leccionDuracion,
              video: leccionVideo,
              cuestionarios: [],
            },
          ],
        },
      ]
    }

    const nuevoCurso = {
      id: nuevoId,
      titulo,
      categoria,
      nivel,
      descripcion,
      color,
      esNuevo: true,
      modulos: modulosFinales,
    }

    setCursos((anteriores) => [nuevoCurso, ...anteriores])
    return { ok: true, curso: nuevoCurso }
  }

  function editarCurso(cursoId, datos) {
    if (datos.titulo !== undefined && datos.titulo.trim().length > 40) {
      return { ok: false, error: 'El título del curso no puede superar los 40 caracteres.' }
    }
    if (datos.descripcion !== undefined && datos.descripcion.trim().length > 200) {
      return { ok: false, error: 'La descripción del curso no puede superar los 200 caracteres.' }
    }

    let cursoActualizado = null

    setCursos((anteriores) => {
      return anteriores.map((c) => {
        if (Number(c.id) !== Number(cursoId)) return c

        let modulosActualizados = c.modulos
        if (Array.isArray(datos.modulos)) {
          modulosActualizados = datos.modulos.map((m, mIdx) => ({
            id: m.id || mIdx + 1,
            titulo: (m.titulo || `Módulo ${mIdx + 1}`).trim(),
            lecciones: (m.lecciones || []).map((l, lIdx) => ({
              id: l.id || Number(cursoId) * 100 + (mIdx + 1) * 10 + (lIdx + 1),
              titulo: (l.titulo || `Lección ${lIdx + 1}`).trim(),
              duracion: Math.max(10, Number(l.duracion) || 60),
              video: l.video || '/videos/101.mp4',
              cuestionarios: l.cuestionarios || [],
            })),
          }))
        }

        cursoActualizado = {
          ...c,
          titulo: datos.titulo !== undefined ? datos.titulo.trim() : c.titulo,
          categoria: datos.categoria !== undefined ? datos.categoria.trim() : c.categoria,
          nivel: datos.nivel !== undefined ? datos.nivel.trim() : c.nivel,
          descripcion: datos.descripcion !== undefined ? datos.descripcion.trim() : c.descripcion,
          color: datos.color !== undefined ? datos.color.trim() : c.color,
          modulos: modulosActualizados,
        }
        return cursoActualizado
      })
    })

    return { ok: Boolean(cursoActualizado), curso: cursoActualizado }
  }

  function actualizarVideoLeccion(cursoId, leccionId, videoUrl, nuevaDuracion, nuevosCuestionarios) {
    const duracionFinal = nuevaDuracion ? Number(nuevaDuracion) : 60

    if (Array.isArray(nuevosCuestionarios)) {
      const fueraDeLimites = nuevosCuestionarios.some(
        (q) => Number(q.segundo || 0) >= duracionFinal || Number(q.segundo || 0) < 0
      )
      if (fueraDeLimites) {
        return {
          ok: false,
          error: 'No se pueden agregar preguntas fuera de los límites del propio video.',
        }
      }
    }

    let encontrada = false
    let leccionActualizada = null
    let cursoActualizado = null

    setCursos((anteriores) => {
      return anteriores.map((curso) => {
        if (Number(curso.id) !== Number(cursoId)) return curso

        const modulosActualizados = curso.modulos.map((modulo) => {
          const leccionesActualizadas = modulo.lecciones.map((leccion) => {
            if (Number(leccion.id) !== Number(leccionId)) return leccion

            encontrada = true
            leccionActualizada = {
              ...leccion,
              video: videoUrl !== undefined && videoUrl !== null ? videoUrl : leccion.video,
              duracion: nuevaDuracion ? Number(nuevaDuracion) : leccion.duracion,
              cuestionarios:
                nuevosCuestionarios !== undefined
                  ? nuevosCuestionarios
                  : leccion.cuestionarios || [],
            }
            return leccionActualizada
          })
          return { ...modulo, lecciones: leccionesActualizadas }
        })

        cursoActualizado = { ...curso, modulos: modulosActualizados }
        return cursoActualizado
      })
    })

    return { ok: encontrada, curso: cursoActualizado, leccion: leccionActualizada }
  }

  function agregarLeccionConVideo(cursoId, moduloId, datosLeccion) {
    const duracionFinal = Math.max(10, Number(datosLeccion.duracion) || 60)

    if (Array.isArray(datosLeccion.cuestionarios)) {
      const fueraDeLimites = datosLeccion.cuestionarios.some(
        (q) => Number(q.segundo || 0) >= duracionFinal || Number(q.segundo || 0) < 0
      )
      if (fueraDeLimites) {
        return {
          ok: false,
          error: 'No se pueden agregar preguntas fuera de los límites del propio video.',
        }
      }
    }

    let cursoActualizado = null
    let nuevaLeccion = null

    setCursos((anteriores) => {
      return anteriores.map((curso) => {
        if (Number(curso.id) !== Number(cursoId)) return curso

        const todasLecciones = curso.modulos.flatMap((m) => m.lecciones)
        const maxLeccionId = todasLecciones.reduce(
          (max, l) => Math.max(max, Number(l.id) || 0),
          0
        )
        const nuevoLeccionId = maxLeccionId > 0 ? maxLeccionId + 1 : Number(curso.id) * 100 + 1

        nuevaLeccion = {
          id: nuevoLeccionId,
          titulo: (datosLeccion.titulo || 'Nueva lección').trim(),
          duracion: Math.max(10, Number(datosLeccion.duracion) || 60),
          video: datosLeccion.video || '/videos/101.mp4',
          cuestionarios: datosLeccion.cuestionarios || [],
        }

        const modulosActualizados = curso.modulos.map((modulo, idx) => {
          const esModuloDestino = moduloId ? Number(modulo.id) === Number(moduloId) : idx === 0
          if (!esModuloDestino) return modulo

          return {
            ...modulo,
            lecciones: [...modulo.lecciones, nuevaLeccion],
          }
        })

        cursoActualizado = { ...curso, modulos: modulosActualizados }
        return cursoActualizado
      })
    })

    return { ok: Boolean(nuevaLeccion), curso: cursoActualizado, leccion: nuevaLeccion }
  }

  function eliminarCurso(cursoId) {
    setCursos((anteriores) => anteriores.filter((c) => Number(c.id) !== Number(cursoId)))
    return { ok: true }
  }

  function restablecerCursos() {
    setCursos(cursosIniciales)
    try {
      localStorage.removeItem(CLAVE_CURSOS)
    } catch (e) {
      // Ignorar
    }
  }

  return (
    <CursosContext.Provider
      value={{
        cursos,
        agregarCurso,
        editarCurso,
        eliminarCurso,
        actualizarVideoLeccion,
        agregarLeccionConVideo,
        restablecerCursos,
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
