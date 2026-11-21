import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useCursos } from '../contextos/CursosContext.jsx'
import BarraProgreso from '../components/BarraProgreso.jsx'
import { leccionesDe } from '../logica/progreso.js'
import { guardarVideoBlob } from '../logica/almacenamientoVideos.js'
import { formatoTiempo } from '../logica/formato.js'

const PALETA_COLORES = [
  { nombre: 'Petróleo', hex: '#2f6f73' },
  { nombre: 'Coral', hex: '#e06d53' },
  { nombre: 'Menta', hex: '#6a9c89' },
  { nombre: 'Ámbar', hex: '#e59b34' },
  { nombre: 'Púrpura', hex: '#8e6c8a' },
  { nombre: 'Azul Eléctrico', hex: '#2563eb' },
]

function Admin() {
  const { usuarioActual, cerrarSesion } = useAuth()
  const {
    cursos,
    agregarCurso,
    editarCurso,
    eliminarCurso,
    actualizarVideoLeccion,
    agregarLeccionConVideo,
  } = useCursos()
  const navigate = useNavigate()

  // Pestaña activa: 'cursos' o 'videos'
  const [pestanaActiva, setPestanaActiva] = useState('cursos')

  // ==============================================================
  // ESTADOS PARA CURSOS (CREACIÓN Y EDICIÓN)
  // ==============================================================
  const [cursoEditandoId, setCursoEditandoId] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('Programación')
  const [categoriaPersonalizada, setCategoriaPersonalizada] = useState('')
  const [nivel, setNivel] = useState('Principiante')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState('#2f6f73')

  // Estructura dinámica de módulos y lecciones
  const [modulos, setModulos] = useState([
    {
      id: 1,
      titulo: 'Módulo 1: Fundamentos',
      lecciones: [
        { id: 101, titulo: '101. Introducción al curso', duracion: 60 },
      ],
    },
  ])

  // Estados de retroalimentación de cursos
  const [errores, setErrores] = useState({})
  const [mensajeExito, setMensajeExito] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')

  const seccionFormularioCursoRef = useRef(null)

  // ==============================================================
  // ESTADOS PARA LA GESTIÓN Y SUBIDA DE VIDEOS
  // ==============================================================
  const [cursoVideoId, setCursoVideoId] = useState(cursos[0]?.id || 1)
  const [modoAsignacion, setModoAsignacion] = useState('existente') // 'existente' | 'nueva'
  const [leccionVideoId, setLeccionVideoId] = useState('')
  const [editandoVideoLeccionId, setEditandoVideoLeccionId] = useState(null)
  const [videoActualReferencia, setVideoActualReferencia] = useState('')

  const [nuevoTituloLeccion, setNuevoTituloLeccion] = useState('')
  const [moduloDestinoId, setModuloDestinoId] = useState(1)
  const [calidadVideo, setCalidadVideo] = useState('1080')
  const [duracionDetectada, setDuracionDetectada] = useState(60)

  // Archivo y vista previa de video
  const [archivoVideo, setArchivoVideo] = useState(null)
  const [previsualizacionUrl, setPrevisualizacionUrl] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [guardandoVideo, setGuardandoVideo] = useState(false)
  const [erroresVideo, setErroresVideo] = useState({})
  const [mensajeExitoVideo, setMensajeExitoVideo] = useState(null)

  // Checkpoints y preguntas interactivas
  const [checkpoints, setCheckpoints] = useState([])

  const inputFileRef = useRef(null)
  const previewVideoRef = useRef(null)
  const seccionSubidaRef = useRef(null)

  // Curso seleccionado actualmente para videos y sus lecciones
  const cursoParaVideo =
    cursos.find((c) => Number(c.id) === Number(cursoVideoId)) || cursos[0]
  const leccionesCursoVideo = cursoParaVideo ? leccionesDe(cursoParaVideo) : []
  const modulosCursoVideo = cursoParaVideo?.modulos || []

  // Sincronizar lección por defecto cuando cambia el curso seleccionado
  useEffect(() => {
    if (leccionesCursoVideo.length > 0) {
      const existe = leccionesCursoVideo.some((l) => Number(l.id) === Number(leccionVideoId))
      if (!existe && !editandoVideoLeccionId) {
        setLeccionVideoId(leccionesCursoVideo[0].id)
      }
    } else {
      setLeccionVideoId('')
    }
  }, [cursoVideoId, leccionesCursoVideo, editandoVideoLeccionId])

  function handleLogout() {
    cerrarSesion()
    navigate('/')
  }

  // ==============================================================
  // GESTIÓN DE MÓDULOS Y LECCIONES DINÁMICAS (CURSO)
  // ==============================================================
  function agregarModulo() {
    setModulos((prev) => [
      ...prev,
      {
        id: Date.now(),
        titulo: `Módulo ${prev.length + 1}: Tema`,
        lecciones: [
          {
            id: Date.now() + 1,
            titulo: 'Nueva lección',
            duracion: 60,
          },
        ],
      },
    ])
  }

  function eliminarModulo(mIndex) {
    if (modulos.length <= 1) return
    setModulos((prev) => prev.filter((_, idx) => idx !== mIndex))
  }

  function cambiarTituloModulo(mIndex, nuevoTitulo) {
    setModulos((prev) => {
      const copia = structuredClone(prev)
      copia[mIndex].titulo = nuevoTitulo
      return copia
    })
  }

  function agregarLeccion(mIndex) {
    setModulos((prev) => {
      const copia = structuredClone(prev)
      const num = copia[mIndex].lecciones.length + 1
      copia[mIndex].lecciones.push({
        id: Date.now(),
        titulo: `Lección ${num}`,
        duracion: 60,
      })
      return copia
    })
  }

  function eliminarLeccion(mIndex, lIndex) {
    if (modulos[mIndex].lecciones.length <= 1) return
    setModulos((prev) => {
      const copia = structuredClone(prev)
      copia[mIndex].lecciones = copia[mIndex].lecciones.filter((_, idx) => idx !== lIndex)
      return copia
    })
  }

  function cambiarLeccion(mIndex, lIndex, campo, valor) {
    setModulos((prev) => {
      const copia = structuredClone(prev)
      copia[mIndex].lecciones[lIndex][campo] = valor
      return copia
    })
  }

  // ==============================================================
  // VALIDACIÓN Y GUARDADO DE CURSO (CREACIÓN Y EDICIÓN)
  // ==============================================================
  function validarFormularioCurso() {
    const err = {}
    if (!titulo.trim()) {
      err.titulo = 'El título del curso es obligatorio.'
    } else if (titulo.trim().length > 40) {
      err.titulo = 'El título del curso no puede superar los 40 caracteres.'
    }

    if (!descripcion.trim()) {
      err.descripcion = 'La descripción del curso es obligatoria.'
    } else if (descripcion.trim().length > 200) {
      err.descripcion = 'La descripción del curso no puede superar los 200 caracteres.'
    }

    if (categoria === 'Otra' && !categoriaPersonalizada.trim()) {
      err.categoria = 'Por favor escribe la categoría.'
    }

    // Validar que cada módulo tenga título y sus lecciones también
    modulos.forEach((m, mIdx) => {
      if (!m.titulo.trim()) {
        err[`modulo_${mIdx}`] = `El título del Módulo ${mIdx + 1} no puede estar vacío.`
      }
      m.lecciones.forEach((l, lIdx) => {
        if (!l.titulo.trim()) {
          err[`leccion_${mIdx}_${lIdx}`] = `La lección ${lIdx + 1} del Módulo ${mIdx + 1} necesita título.`
        }
      })
    })

    return err
  }

  function handleGuardarCurso(e) {
    e.preventDefault()
    setMensajeExito('')

    const valErrores = validarFormularioCurso()
    if (Object.keys(valErrores).length > 0) {
      setErrores(valErrores)
      return
    }

    setErrores({})

    const categoriaFinal =
      categoria === 'Otra' ? categoriaPersonalizada.trim() : categoria

    if (cursoEditandoId) {
      // MODO EDICIÓN
      const resultado = editarCurso(cursoEditandoId, {
        titulo,
        categoria: categoriaFinal,
        nivel,
        descripcion,
        color,
        modulos,
      })

      if (resultado.ok) {
        setMensajeExito(`El curso "${titulo}" fue actualizado exitosamente.`)
        cancelarEdicionCurso()
      } else {
        setErrores({ general: resultado.error || 'No se pudo actualizar el curso.' })
      }
    } else {
      // MODO CREACIÓN
      const resultado = agregarCurso({
        titulo,
        categoria: categoriaFinal,
        nivel,
        descripcion,
        color,
        modulos,
      })

      if (resultado.ok) {
        setMensajeExito(`El curso "${resultado.curso.titulo}" fue agregado exitosamente al catálogo.`)
        cancelarEdicionCurso()
      } else {
        setErrores({ general: resultado.error || 'No se pudo agregar el curso.' })
      }
    }
  }

  function iniciarEdicionCurso(curso) {
    setCursoEditandoId(curso.id)
    setTitulo(curso.titulo)
    const esCatEstandar = ['Programación', 'Diseño', 'Datos', 'DevOps'].includes(curso.categoria)
    setCategoria(esCatEstandar ? curso.categoria : 'Otra')
    setCategoriaPersonalizada(esCatEstandar ? '' : curso.categoria)
    setNivel(curso.nivel)
    setDescripcion(curso.descripcion)
    setColor(curso.color)
    setModulos(structuredClone(curso.modulos))
    setMensajeExito('')
    setErrores({})
    setPestanaActiva('cursos')
    seccionFormularioCursoRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function cancelarEdicionCurso() {
    setCursoEditandoId(null)
    setTitulo('')
    setDescripcion('')
    setCategoria('Programación')
    setCategoriaPersonalizada('')
    setNivel('Principiante')
    setColor('#2f6f73')
    setModulos([
      {
        id: 1,
        titulo: 'Módulo 1: Fundamentos',
        lecciones: [
          { id: 101, titulo: '101. Introducción al curso', duracion: 60 },
        ],
      },
    ])
    setErrores({})
  }

  function handleEliminarCurso(cursoId, nombre) {
    if (window.confirm(`¿Estás seguro de que deseas eliminar el curso "${nombre}"?`)) {
      eliminarCurso(cursoId)
      if (cursoEditandoId === cursoId) {
        cancelarEdicionCurso()
      }
      setMensajeExito(`El curso "${nombre}" fue eliminado del catálogo.`)
    }
  }

  // ==============================================================
  // GESTIÓN DE CHECKPOINTS Y PREGUNTAS INTERACTIVAS
  // ==============================================================
  function agregarCheckpoint() {
    setCheckpoints((prev) => [
      ...prev,
      {
        id: Date.now(),
        minuto: 0,
        segundo: 30,
        pregunta: '',
        opciones: ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'],
        correcta: 0,
        explicacion: '',
      },
    ])
  }

  function eliminarCheckpoint(cpIndex) {
    setCheckpoints((prev) => prev.filter((_, idx) => idx !== cpIndex))
  }

  function actualizarCheckpoint(cpIndex, campo, valor) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      copia[cpIndex][campo] = valor
      return copia
    })
    setErroresVideo((prev) => {
      if (!prev[`cp_tiempo_${cpIndex}`] && !prev[`cp_${cpIndex}`] && !prev[`cp_op_${cpIndex}`] && !prev.general) return prev
      const copia = { ...prev }
      delete copia[`cp_tiempo_${cpIndex}`]
      delete copia[`cp_${cpIndex}`]
      delete copia[`cp_op_${cpIndex}`]
      delete copia.general
      return copia
    })
  }

  function actualizarOpcion(cpIndex, opIndex, valor) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      copia[cpIndex].opciones[opIndex] = valor
      return copia
    })
  }

  function agregarOpcion(cpIndex) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      if (copia[cpIndex].opciones.length < 6) {
        copia[cpIndex].opciones.push(`Opción ${copia[cpIndex].opciones.length + 1}`)
      }
      return copia
    })
  }

  function eliminarOpcion(cpIndex, opIndex) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      if (copia[cpIndex].opciones.length > 2) {
        copia[cpIndex].opciones = copia[cpIndex].opciones.filter((_, idx) => idx !== opIndex)
        if (copia[cpIndex].correcta >= copia[cpIndex].opciones.length) {
          copia[cpIndex].correcta = 0
        }
      }
      return copia
    })
  }

  function capturarTiempoActualPreview(cpIndex) {
    if (previewVideoRef.current) {
      let sec = Math.round(previewVideoRef.current.currentTime)
      if (duracionDetectada > 0 && sec >= duracionDetectada) {
        sec = Math.max(1, duracionDetectada - 1)
      }
      actualizarCheckpoint(cpIndex, 'minuto', Math.floor(sec / 60))
      actualizarCheckpoint(cpIndex, 'segundo', sec % 60)
    }
  }

  // ==============================================================
  // FUNCIONES PARA PROCESAR Y GUARDAR VIDEOS
  // ==============================================================
  function procesarArchivoVideo(file) {
    if (!file) return

    const formatosValidos = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'video/x-matroska',
    ]
    const esExtensionValida = /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name)

    if (!formatosValidos.includes(file.type) && !esExtensionValida) {
      setErroresVideo((prev) => ({
        ...prev,
        archivo: 'Formato no soportado. Por favor selecciona un archivo .mp4, .webm u .ogg.',
      }))
      return
    }

    if (previsualizacionUrl) {
      URL.revokeObjectURL(previsualizacionUrl)
    }

    const url = URL.createObjectURL(file)
    setArchivoVideo(file)
    setPrevisualizacionUrl(url)
    setErroresVideo((prev) => ({ ...prev, archivo: '', general: '' }))

    // Detección automática de duración
    const tempVideo = document.createElement('video')
    tempVideo.preload = 'metadata'
    tempVideo.src = url
    tempVideo.onloadedmetadata = () => {
      if (tempVideo.duration && !isNaN(tempVideo.duration)) {
        const seg = Math.round(tempVideo.duration)
        if (seg > 0) {
          setDuracionDetectada(seg)
        }
      }
    }
  }

  function quitarArchivoVideo() {
    if (previsualizacionUrl) {
      URL.revokeObjectURL(previsualizacionUrl)
    }
    setArchivoVideo(null)
    setPrevisualizacionUrl(null)
    if (inputFileRef.current) inputFileRef.current.value = ''
  }

  function iniciarEdicionVideoLeccion(leccion, cursoId) {
    setCursoVideoId(cursoId)
    setModoAsignacion('existente')
    setLeccionVideoId(leccion.id)
    setEditandoVideoLeccionId(leccion.id)
    setDuracionDetectada(leccion.duracion || 60)
    setVideoActualReferencia(leccion.video || '')

    // Cargar checkpoints existentes si los tiene
    if (Array.isArray(leccion.cuestionarios) && leccion.cuestionarios.length > 0) {
      setCheckpoints(
        leccion.cuestionarios.map((q, idx) => ({
          id: q.id || Date.now() + idx,
          minuto: Math.floor((q.segundo || 0) / 60),
          segundo: (q.segundo || 0) % 60,
          pregunta: q.pregunta || '',
          opciones: Array.isArray(q.opciones) && q.opciones.length > 0 ? [...q.opciones] : ['Opción 1', 'Opción 2'],
          correcta: q.correcta !== undefined ? q.correcta : 0,
          explicacion: q.explicacion || '',
        }))
      )
    } else {
      setCheckpoints([])
    }

    quitarArchivoVideo()
    setMensajeExitoVideo(null)
    setErroresVideo({})
    setPestanaActiva('videos')
    seccionSubidaRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function cancelarEdicionVideo() {
    setEditandoVideoLeccionId(null)
    setVideoActualReferencia('')
    setCheckpoints([])
    quitarArchivoVideo()
    setErroresVideo({})
  }

  async function handleSubirVideo(e) {
    e.preventDefault()
    setMensajeExitoVideo(null)

    const err = {}
    // Si no está en edición y no hay archivo seleccionado:
    if (!archivoVideo && !videoActualReferencia) {
      err.archivo = 'Debes seleccionar o arrastrar un archivo de video.'
    }
    if (!cursoVideoId) {
      err.curso = 'Selecciona un curso de destino.'
    }
    if (modoAsignacion === 'existente' && !leccionVideoId) {
      err.leccion = 'Selecciona la lección a la que se vinculará el video.'
    }
    if (modoAsignacion === 'nueva' && !nuevoTituloLeccion.trim()) {
      err.titulo = 'Escribe el título para la nueva lección.'
    }

    // Validar checkpoints
    const duracionLimite = Number(duracionDetectada) || 0

    checkpoints.forEach((cp, idx) => {
      const segundoTotal = Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0)

      if (segundoTotal < 0) {
        err[`cp_tiempo_${idx}`] = `El tiempo de la Pregunta #${idx + 1} no puede ser negativo.`
      } else if (duracionLimite > 0 && segundoTotal > duracionLimite) {
        err[`cp_tiempo_${idx}`] = `No se pueden agregar preguntas fuera de los límites del propio video. La duración del video es de ${formatoTiempo(duracionLimite)} (${duracionLimite}s) y el checkpoint fue colocado en el segundo ${segundoTotal} (${formatoTiempo(segundoTotal)}).`
      } else if (duracionLimite > 0 && segundoTotal >= duracionLimite) {
        err[`cp_tiempo_${idx}`] = `No se pueden agregar preguntas fuera de los límites del propio video. El checkpoint debe colocarse antes de que finalice el video (máximo al segundo ${Math.max(1, duracionLimite - 1)}).`
      }

      if (!cp.pregunta.trim()) {
        err[`cp_${idx}`] = `Completa el texto de la Pregunta #${idx + 1}.`
      }
      const opcionesValidas = cp.opciones.filter((o) => o.trim() !== '')
      if (opcionesValidas.length < 2) {
        err[`cp_op_${idx}`] = `La Pregunta #${idx + 1} necesita al menos 2 opciones con texto.`
      }
    })

    if (Object.keys(err).length > 0) {
      const hayErrorTiempo = Object.keys(err).some((k) => k.startsWith('cp_tiempo_'))
      if (hayErrorTiempo && !err.general) {
        err.general = 'No se pueden agregar preguntas fuera de los límites del propio video. Revisa los checkpoints señalados abajo.'
      }
      setErroresVideo(err)
      return
    }

    setErroresVideo({})
    setGuardandoVideo(true)

    try {
      let refVideo = videoActualReferencia || '/videos/101.mp4'

      // Si subió un archivo nuevo, lo guardamos en IndexedDB
      if (archivoVideo) {
        const clave = 'video_' + Date.now()
        await guardarVideoBlob(clave, archivoVideo, {
          nombre: archivoVideo.name,
          tamano: archivoVideo.size,
          duracion: duracionDetectada,
        })
        refVideo = 'idb:' + clave
      }

      // Dar formato final a los cuestionarios
      const cuestionariosFinales = checkpoints.map((cp, idx) => ({
        id: cp.id || Date.now() + idx,
        segundo: Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0),
        pregunta: cp.pregunta.trim(),
        opciones: cp.opciones.map((o) => o.trim()).filter(Boolean),
        correcta: Math.min(Math.max(0, Number(cp.correcta) || 0), cp.opciones.length - 1),
        explicacion: (cp.explicacion || '').trim(),
      }))

      if (modoAsignacion === 'existente') {
        const resultado = actualizarVideoLeccion(
          cursoVideoId,
          leccionVideoId,
          refVideo,
          duracionDetectada,
          cuestionariosFinales
        )

        if (resultado.ok) {
          setMensajeExitoVideo({
            texto: `El video y sus ${cuestionariosFinales.length} checkpoints fueron guardados correctamente en la lección "${resultado.leccion.titulo}".`,
            cursoId: cursoVideoId,
            leccionId: leccionVideoId,
          })
          cancelarEdicionVideo()
        } else {
          setErroresVideo({
            general: resultado.error || 'No se pudo actualizar el video o las preguntas.',
          })
        }
      } else {
        const resultado = agregarLeccionConVideo(cursoVideoId, moduloDestinoId, {
          titulo: nuevoTituloLeccion.trim(),
          duracion: duracionDetectada,
          video: refVideo,
          cuestionarios: cuestionariosFinales,
        })

        if (resultado.ok) {
          setMensajeExitoVideo({
            texto: `La nueva lección "${resultado.leccion.titulo}" fue creada con su video y ${cuestionariosFinales.length} checkpoints interactivos.`,
            cursoId: cursoVideoId,
            leccionId: resultado.leccion.id,
          })
          setNuevoTituloLeccion('')
          cancelarEdicionVideo()
        } else {
          setErroresVideo({
            general: resultado.error || 'No se pudo crear la nueva lección con el video.',
          })
        }
      }
    } catch (error) {
      setErroresVideo({
        general: 'Error al almacenar el video: ' + (error.message || 'Error desconocido'),
      })
    } finally {
      setGuardandoVideo(false)
    }
  }

  // Cursos filtrados para el catálogo
  const cursosFiltrados = cursos.filter(
    (c) =>
      c.titulo.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      c.categoria.toLowerCase().includes(filtroTexto.toLowerCase())
  )

  const totalLeccionesCatalogo = cursos.reduce((acc, c) => acc + leccionesDe(c).length, 0)

  // Cálculos dinámicos para la vista previa del curso en edición/creación
  const totalLeccionesPreview = modulos.reduce((acc, m) => acc + m.lecciones.length, 0)
  const totalSegundosPreview = modulos.reduce(
    (acc, m) => acc + m.lecciones.reduce((lAcc, l) => lAcc + (Number(l.duracion) || 0), 0),
    0
  )

  return (
    <div className="admin-layout">
      {/* Barra superior de administración */}
      <header className="admin-header">
        <div className="admin-header-contenido">
          <div className="admin-marca">
            <span className="logo-punto"></span>
            <span className="logo-texto">andén</span>
            <span className="badge-admin">ADMIN</span>
          </div>

          <div className="admin-header-acciones">
            <Link to="/" className="boton-enlace-estudiante" title="Ver catálogo como estudiante">
              Ver portal de estudiante
            </Link>

            <div className="admin-perfil">
              <span className="avatar avatar-admin">{usuarioActual?.iniciales || 'AD'}</span>
              <span className="admin-nombre">{usuarioActual?.nombre || 'Administrador'}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="boton-cerrar-sesion"
                title="Cerrar sesión"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal de administración */}
      <main className="contenedor admin-principal">
        <div className="encabezado admin-encabezado">
          <div>
            <h1>Panel de Administración</h1>
            <p className="texto-suave">
              Gestiona los cursos, contenidos y recursos educativos de Andén.
            </p>
          </div>

          {/* Estadísticas rápidas */}
          <div className="admin-resumen-tarjetas">
            <div className="tarjeta-resumen">
              <span className="resumen-numero">{cursos.length}</span>
              <span className="resumen-etiqueta">Cursos en total</span>
            </div>
            <div className="tarjeta-resumen">
              <span className="resumen-numero">{totalLeccionesCatalogo}</span>
              <span className="resumen-etiqueta">Lecciones activas</span>
            </div>
          </div>
        </div>

        {/* Pestañas de navegación de administración */}
        <div className="admin-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestanaActiva === 'cursos'}
            className={`admin-tab ${pestanaActiva === 'cursos' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('cursos')}
          >
            Gestión de Cursos
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={pestanaActiva === 'videos'}
            className={`admin-tab ${pestanaActiva === 'videos' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('videos')}
          >
            Gestión de Videos y Preguntas
          </button>
        </div>

        {/* ============================================================== */}
        {/* SECCIÓN 1: GESTIÓN DE CURSOS (CREAR Y EDITAR)                  */}
        {/* ============================================================== */}
        {pestanaActiva === 'cursos' && (
          <div className="admin-panel-cursos">
            {mensajeExito && (
              <div className="alerta-exito" role="alert">
                <span>{mensajeExito}</span>
                <button
                  type="button"
                  className="boton-cerrar-alerta"
                  onClick={() => setMensajeExito('')}
                >
                  Cerrar
                </button>
              </div>
            )}

            <div className="admin-grid">
              {/* Formulario para agregar / editar curso */}
              <section
                className="admin-seccion-formulario"
                ref={seccionFormularioCursoRef}
                id="seccion-formulario-curso"
              >
                <div className="formulario-cabecera">
                  <div className="formulario-titulo-acciones">
                    <h2>{cursoEditandoId ? 'Editar curso' : 'Agregar nuevo curso'}</h2>
                    {cursoEditandoId && (
                      <button
                        type="button"
                        className="boton boton-claro boton-cancelar-edicion"
                        onClick={cancelarEdicionCurso}
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                  <p className="texto-suave">
                    {cursoEditandoId
                      ? `Modificando los datos y contenidos del curso (ID: ${cursoEditandoId}).`
                      : 'Define la información general y agrega los módulos y lecciones que desees.'}
                  </p>
                </div>

                <form onSubmit={handleGuardarCurso} className="formulario-admin" noValidate>
                  {errores.general && (
                    <div className="alerta-error" role="alert">
                      <span>{errores.general}</span>
                    </div>
                  )}

                  <div className="campo-grupo">
                    <div className="campo-etiqueta-fila">
                      <label htmlFor="curso-titulo" className="campo-etiqueta">
                        Título del curso *
                      </label>
                      <span className={`campo-contador ${titulo.length >= 40 ? 'limite-alcanzado' : ''}`}>
                        {titulo.length}/40
                      </span>
                    </div>
                    <input
                      id="curso-titulo"
                      type="text"
                      maxLength={40}
                      className={`campo-input ${errores.titulo ? 'con-error' : ''}`}
                      placeholder="Ej: Fundamentos de TypeScript"
                      value={titulo}
                      onChange={(e) => {
                        setTitulo(e.target.value)
                        if (errores.titulo) setErrores((prev) => ({ ...prev, titulo: '' }))
                      }}
                    />
                    {errores.titulo && (
                      <span className="campo-mensaje-error">{errores.titulo}</span>
                    )}
                  </div>

                  <div className="admin-form-fila">
                    <div className="campo-grupo">
                      <label htmlFor="curso-categoria" className="campo-etiqueta">
                        Categoría
                      </label>
                      <select
                        id="curso-categoria"
                        className="campo-input"
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value)}
                      >
                        <option value="Programación">Programación</option>
                        <option value="Diseño">Diseño</option>
                        <option value="Datos">Datos</option>
                        <option value="DevOps">DevOps</option>
                        <option value="Otra">Otra...</option>
                      </select>
                      {categoria === 'Otra' && (
                        <input
                          type="text"
                          className="campo-input campo-extra"
                          placeholder="Escribe la categoría"
                          value={categoriaPersonalizada}
                          onChange={(e) => setCategoriaPersonalizada(e.target.value)}
                        />
                      )}
                    </div>

                    <div className="campo-grupo">
                      <label htmlFor="curso-nivel" className="campo-etiqueta">
                        Nivel de dificultad
                      </label>
                      <select
                        id="curso-nivel"
                        className="campo-input"
                        value={nivel}
                        onChange={(e) => setNivel(e.target.value)}
                      >
                        <option value="Principiante">Principiante</option>
                        <option value="Intermedio">Intermedio</option>
                        <option value="Avanzado">Avanzado</option>
                      </select>
                    </div>
                  </div>

                  <div className="campo-grupo">
                    <label className="campo-etiqueta">Color de la línea de metro</label>
                    <div className="selector-colores">
                      {PALETA_COLORES.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          className={`muestra-color ${color === c.hex ? 'seleccionado' : ''}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.nombre}
                          aria-label={c.nombre}
                          onClick={() => setColor(c.hex)}
                        />
                      ))}
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="color-custom-picker"
                        title="Elegir otro color"
                        aria-label="Elegir otro color"
                      />
                    </div>
                  </div>

                  <div className="campo-grupo">
                    <div className="campo-etiqueta-fila">
                      <label htmlFor="curso-descripcion" className="campo-etiqueta">
                        Descripción del curso *
                      </label>
                      <span className={`campo-contador ${descripcion.length >= 200 ? 'limite-alcanzado' : ''}`}>
                        {descripcion.length}/200
                      </span>
                    </div>
                    <textarea
                      id="curso-descripcion"
                      rows={3}
                      maxLength={200}
                      className={`campo-input campo-textarea ${
                        errores.descripcion ? 'con-error' : ''
                      }`}
                      placeholder="Breve resumen de los contenidos y habilidades que se adquirirán..."
                      value={descripcion}
                      onChange={(e) => {
                        setDescripcion(e.target.value)
                        if (errores.descripcion)
                          setErrores((prev) => ({ ...prev, descripcion: '' }))
                      }}
                    />
                    {errores.descripcion && (
                      <span className="campo-mensaje-error">{errores.descripcion}</span>
                    )}
                  </div>

                  {/* ============================================================== */}
                  {/* CONSTRUCTOR DE MÓDULOS Y LECCIONES CON BOTÓN '+'              */}
                  {/* ============================================================== */}
                  <div className="bloque-modulos-constructor">
                    <div className="seccion-subcabecera">
                      <div>
                        <h3>Módulos y lecciones del curso</h3>
                        <p className="texto-suave">
                          Agrega los módulos que desees y dentro de cada uno las lecciones correspondientes.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="boton boton-claro boton-agregar-modulo"
                        onClick={agregarModulo}
                      >
                        + Agregar módulo
                      </button>
                    </div>

                    <div className="modulos-lista">
                      {modulos.map((m, mIdx) => (
                        <div key={m.id || mIdx} className="modulo-card">
                          <div className="modulo-card-header">
                            <span className="modulo-badge-numero">Módulo {mIdx + 1}</span>
                            <div className="modulo-input-box">
                              <input
                                type="text"
                                className={`campo-input ${
                                  errores[`modulo_${mIdx}`] ? 'con-error' : ''
                                }`}
                                placeholder="Título del módulo"
                                value={m.titulo}
                                onChange={(e) => cambiarTituloModulo(mIdx, e.target.value)}
                              />
                              {errores[`modulo_${mIdx}`] && (
                                <span className="campo-mensaje-error">
                                  {errores[`modulo_${mIdx}`]}
                                </span>
                              )}
                            </div>
                            {modulos.length > 1 && (
                              <button
                                type="button"
                                className="boton-eliminar-item"
                                title="Eliminar este módulo"
                                onClick={() => eliminarModulo(mIdx)}
                              >
                                Eliminar módulo
                              </button>
                            )}
                          </div>

                          {/* Lista de lecciones del módulo */}
                          <div className="lecciones-lista-modulo">
                            <span className="lecciones-titulo-guia">
                              Lecciones de este módulo:
                            </span>

                            {m.lecciones.map((l, lIdx) => (
                              <div key={l.id || lIdx} className="leccion-fila-item">
                                <span className="leccion-indice">{lIdx + 1}.</span>
                                <div className="leccion-input-titulo-box">
                                  <input
                                    type="text"
                                    className={`campo-input ${
                                      errores[`leccion_${mIdx}_${lIdx}`] ? 'con-error' : ''
                                    }`}
                                    placeholder="Título de la lección"
                                    value={l.titulo}
                                    onChange={(e) =>
                                      cambiarLeccion(mIdx, lIdx, 'titulo', e.target.value)
                                    }
                                  />
                                  {errores[`leccion_${mIdx}_${lIdx}`] && (
                                    <span className="campo-mensaje-error">
                                      {errores[`leccion_${mIdx}_${lIdx}`]}
                                    </span>
                                  )}
                                </div>

                                <div className="leccion-duracion-box">
                                  <input
                                    type="number"
                                    min="10"
                                    className="campo-input input-segundos"
                                    title="Duración en segundos"
                                    value={l.duracion}
                                    onChange={(e) =>
                                      cambiarLeccion(mIdx, lIdx, 'duracion', e.target.value)
                                    }
                                  />
                                  <span className="texto-suave">seg</span>
                                </div>

                                {m.lecciones.length > 1 && (
                                  <button
                                    type="button"
                                    className="boton-eliminar-item"
                                    title="Quitar esta lección"
                                    onClick={() => eliminarLeccion(mIdx, lIdx)}
                                  >
                                    Quitar
                                  </button>
                                )}
                              </div>
                            ))}

                            <button
                              type="button"
                              className="boton-texto-mas"
                              onClick={() => agregarLeccion(mIdx)}
                            >
                              + Agregar lección
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="botones-formulario-curso">
                    <button type="submit" className="boton boton-crear-curso">
                      {cursoEditandoId ? 'Guardar cambios del curso' : 'Publicar curso en Andén'}
                    </button>
                    {cursoEditandoId && (
                      <button
                        type="button"
                        className="boton boton-claro"
                        onClick={cancelarEdicionCurso}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </section>

              {/* Vista previa en tiempo real */}
              <aside className="admin-seccion-preview">
                <h2>Vista previa</h2>
                <p className="texto-suave">Aspecto del curso en el catálogo general:</p>

                <article
                  className="admin-preview-tarjeta"
                  style={{ '--color-linea': color }}
                >
                  <div className="preview-tarjeta-cuerpo">
                    <span className="insignia">{cursoEditandoId || cursos.length + 1}</span>
                    <div className="preview-tarjeta-info">
                      <h3>{titulo.trim() || 'Título del curso'}</h3>
                      <p className="texto-suave">
                        {descripcion.trim() ||
                          'Aquí se mostrará la descripción detallada del curso para los alumnos.'}
                      </p>
                      <p className="meta">
                        {categoria === 'Otra'
                          ? categoriaPersonalizada.trim() || 'General'
                          : categoria}{' '}
                        · {nivel} · {totalLeccionesPreview} lecciones (~
                        {Math.ceil(totalSegundosPreview / 60)} min)
                      </p>
                    </div>
                  </div>

                  <div className="preview-tarjeta-pie">
                    <div className="fila-curso-progreso">
                      <span>0%</span>
                      <BarraProgreso porcentaje={0} />
                    </div>
                    <span className="boton boton-claro">Empezar</span>
                  </div>
                </article>
              </aside>
            </div>

            {/* Listado de cursos con opciones de Editar y Eliminar */}
            <section className="admin-seccion-catalogo">
              <div className="catalogo-cabecera">
                <div>
                  <h2>Cursos actuales en la plataforma ({cursos.length})</h2>
                  <p className="texto-suave">
                    Visualiza, edita o gestiona los cursos disponibles en la red de aprendizaje.
                  </p>
                </div>
                <input
                  type="search"
                  className="campo-input admin-buscador"
                  placeholder="Buscar curso por título o categoría..."
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                />
              </div>

              <div className="lista-cursos">
                {cursosFiltrados.map((c) => {
                  const cantLecciones = leccionesDe(c).length
                  const cantModulos = c.modulos?.length || 1
                  return (
                    <article
                      key={c.id}
                      className="fila-curso"
                      style={{ '--color-linea': c.color }}
                    >
                      <span className="insignia">{c.id}</span>

                      <div>
                        <h3>
                          {c.titulo}
                          {c.esNuevo && <span className="tag-nuevo">Nuevo</span>}
                        </h3>
                        <p className="texto-suave">{c.descripcion}</p>
                        <p className="meta">
                          {c.categoria}, {c.nivel}, {cantModulos}{' '}
                          {cantModulos === 1 ? 'módulo' : 'módulos'}, {cantLecciones}{' '}
                          {cantLecciones === 1 ? 'lección' : 'lecciones'}
                        </p>
                      </div>

                      <div className="admin-acciones-curso">
                        <button
                          type="button"
                          className="boton boton-claro"
                          onClick={() => iniciarEdicionCurso(c)}
                        >
                          Editar curso
                        </button>
                        <Link to={'/aula/' + c.id} className="boton boton-claro">
                          Ver en aula
                        </Link>
                        <button
                          type="button"
                          className="boton boton-claro boton-peligro-borde"
                          onClick={() => handleEliminarCurso(c.id, c.titulo)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  )
                })}

                {cursosFiltrados.length === 0 && (
                  <p className="mensaje-vacio">No se encontraron cursos con ese criterio.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ============================================================== */}
        {/* SECCIÓN 2: GESTIÓN DE VIDEOS Y PREGUNTAS (FUNCIONAL)          */}
        {/* ============================================================== */}
        {pestanaActiva === 'videos' && (
          <div className="admin-panel-videos">
            {mensajeExitoVideo && (
              <div className="alerta-exito" role="alert">
                <div className="alerta-exito-texto">
                  <p>
                    <strong>{mensajeExitoVideo.texto}</strong>
                  </p>
                </div>
                <div className="alerta-exito-acciones">
                  <Link
                    to={`/aula/${mensajeExitoVideo.cursoId}/${mensajeExitoVideo.leccionId}`}
                    className="boton boton-claro"
                  >
                    Ver en aula
                  </Link>
                  <button
                    type="button"
                    className="boton-cerrar-alerta"
                    onClick={() => setMensajeExitoVideo(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {erroresVideo.general && (
              <div className="alerta-error" role="alert">
                <span>{erroresVideo.general}</span>
              </div>
            )}

            <div className="admin-grid">
              {/* Formulario de subida y edición de video */}
              <section className="admin-seccion-formulario" ref={seccionSubidaRef}>
                <div className="formulario-cabecera">
                  <div className="formulario-titulo-acciones">
                    <h2>
                      {editandoVideoLeccionId
                        ? 'Editar video y preguntas de lección'
                        : 'Cargar video de lección'}
                    </h2>
                    {editandoVideoLeccionId && (
                      <button
                        type="button"
                        className="boton boton-claro boton-cancelar-edicion"
                        onClick={cancelarEdicionVideo}
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                  <p className="texto-suave">
                    {editandoVideoLeccionId
                      ? `Modificando la grabación y preguntas de la lección ID ${editandoVideoLeccionId}.`
                      : 'Sube un archivo de video, vincúlalo a una lección y programa preguntas interactivas en el segundo exacto.'}
                  </p>
                </div>

                <form onSubmit={handleSubirVideo} className="formulario-admin" noValidate>
                  {/* Selector de archivo / Drag and Drop */}
                  <div className="campo-grupo">
                    <label className="campo-etiqueta">
                      Archivo de video {editandoVideoLeccionId ? '(opcional si conservas el actual)' : '*'}
                    </label>
                    <input
                      ref={inputFileRef}
                      type="file"
                      accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files?.[0]) procesarArchivoVideo(e.target.files[0])
                      }}
                    />

                    {!archivoVideo ? (
                      <div
                        className={`dropzone-video ${arrastrando ? 'arrastrando' : ''} ${
                          erroresVideo.archivo ? 'con-error' : ''
                        }`}
                        onClick={() => inputFileRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setArrastrando(true)
                        }}
                        onDragLeave={() => setArrastrando(false)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setArrastrando(false)
                          if (e.dataTransfer.files?.[0]) {
                            procesarArchivoVideo(e.dataTransfer.files[0])
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label="Seleccionar o arrastrar archivo de video"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            inputFileRef.current?.click()
                          }
                        }}
                      >
                        <p className="dropzone-texto-principal">
                          {videoActualReferencia
                            ? 'Arrastra un nuevo video si deseas reemplazar el actual'
                            : 'Arrastra y suelta aquí tu archivo de video (.mp4, .webm, .ogg)'}
                        </p>
                        <p className="texto-suave">o haz clic para examinar tu equipo</p>
                        {videoActualReferencia && (
                          <span className="tag-archivo-actual">
                            Video actual: {videoActualReferencia}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="video-cargado-resumen">
                        <div className="video-cargado-detalles">
                          <div>
                            <strong>{archivoVideo.name}</strong>
                            <p className="texto-suave">
                              {(archivoVideo.size / (1024 * 1024)).toFixed(1)} MB · Duración
                              estimada: {formatoTiempo(duracionDetectada)}
                            </p>
                          </div>
                          <div className="video-cargado-acciones">
                            <button
                              type="button"
                              className="boton-enlace"
                              onClick={() => inputFileRef.current?.click()}
                            >
                              Cambiar video
                            </button>
                            <button
                              type="button"
                              className="boton-enlace boton-peligro"
                              onClick={quitarArchivoVideo}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>

                        {previsualizacionUrl && (
                          <div className="admin-video-preview-wrapper">
                            <video
                              ref={previewVideoRef}
                              src={previsualizacionUrl}
                              controls
                              className="admin-video-preview-player"
                              preload="metadata"
                              onLoadedMetadata={(e) => {
                                if (e.target.duration && !isNaN(e.target.duration)) {
                                  const seg = Math.round(e.target.duration)
                                  if (seg > 0) setDuracionDetectada(seg)
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {erroresVideo.archivo && (
                      <span className="campo-mensaje-error">{erroresVideo.archivo}</span>
                    )}
                  </div>

                  {/* Selección de curso */}
                  <div className="campo-grupo">
                    <label htmlFor="video-curso-select" className="campo-etiqueta">
                      Curso de destino *
                    </label>
                    <select
                      id="video-curso-select"
                      className="campo-input"
                      value={cursoVideoId}
                      onChange={(e) => {
                        setCursoVideoId(Number(e.target.value))
                        setLeccionVideoId('')
                        if (erroresVideo.curso) {
                          setErroresVideo((prev) => ({ ...prev, curso: '' }))
                        }
                      }}
                    >
                      {cursos.map((c) => (
                        <option key={c.id} value={c.id}>
                          Línea {c.id}: {c.titulo} ({c.categoria})
                        </option>
                      ))}
                    </select>
                    {erroresVideo.curso && (
                      <span className="campo-mensaje-error">{erroresVideo.curso}</span>
                    )}
                  </div>

                  {/* Modo de asignación: Lección existente vs Nueva lección */}
                  <div className="campo-grupo">
                    <label className="campo-etiqueta">Destino del video</label>
                    <div className="selector-modo-asignacion">
                      <label
                        className={`modo-opcion ${
                          modoAsignacion === 'existente' ? 'activo' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="modo-asignacion"
                          value="existente"
                          checked={modoAsignacion === 'existente'}
                          onChange={() => setModoAsignacion('existente')}
                        />
                        <span>Vincular / editar lección existente</span>
                      </label>
                      <label
                        className={`modo-opcion ${
                          modoAsignacion === 'nueva' ? 'activo' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="modo-asignacion"
                          value="nueva"
                          checked={modoAsignacion === 'nueva'}
                          onChange={() => setModoAsignacion('nueva')}
                        />
                        <span>Crear nueva lección</span>
                      </label>
                    </div>
                  </div>

                  {/* Campos si es lección existente */}
                  {modoAsignacion === 'existente' && (
                    <div className="campo-grupo">
                      <label htmlFor="video-leccion-select" className="campo-etiqueta">
                        Lección a la que se vinculará el video *
                      </label>
                      <select
                        id="video-leccion-select"
                        className={`campo-input ${erroresVideo.leccion ? 'con-error' : ''}`}
                        value={leccionVideoId}
                        onChange={(e) => {
                          const idNum = Number(e.target.value)
                          setLeccionVideoId(idNum)
                          const lecc = leccionesCursoVideo.find((l) => Number(l.id) === idNum)
                          if (lecc) {
                            setDuracionDetectada(lecc.duracion || 60)
                            setVideoActualReferencia(lecc.video || '')
                            if (Array.isArray(lecc.cuestionarios)) {
                              setCheckpoints(
                                lecc.cuestionarios.map((q, idx) => ({
                                  id: q.id || Date.now() + idx,
                                  minuto: Math.floor((q.segundo || 0) / 60),
                                  segundo: (q.segundo || 0) % 60,
                                  pregunta: q.pregunta || '',
                                  opciones:
                                    Array.isArray(q.opciones) && q.opciones.length > 0
                                      ? [...q.opciones]
                                      : ['Opción 1', 'Opción 2'],
                                  correcta: q.correcta !== undefined ? q.correcta : 0,
                                  explicacion: q.explicacion || '',
                                }))
                              )
                            }
                          }
                          if (erroresVideo.leccion) {
                            setErroresVideo((prev) => ({ ...prev, leccion: '' }))
                          }
                        }}
                      >
                        <option value="" disabled>
                          Selecciona una lección...
                        </option>
                        {leccionesCursoVideo.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.id}: {l.titulo} ({formatoTiempo(l.duracion)})
                          </option>
                        ))}
                      </select>
                      {erroresVideo.leccion && (
                        <span className="campo-mensaje-error">{erroresVideo.leccion}</span>
                      )}
                    </div>
                  )}

                  {/* Campos si es nueva lección */}
                  {modoAsignacion === 'nueva' && (
                    <div className="modulo-leccion-box">
                      <h3>Datos de la nueva lección</h3>
                      <div className="campo-grupo">
                        <label htmlFor="nueva-leccion-titulo" className="campo-etiqueta">
                          Título de la lección *
                        </label>
                        <input
                          id="nueva-leccion-titulo"
                          type="text"
                          className={`campo-input ${erroresVideo.titulo ? 'con-error' : ''}`}
                          placeholder="Ej: Técnicas avanzadas de estado"
                          value={nuevoTituloLeccion}
                          onChange={(e) => {
                            setNuevoTituloLeccion(e.target.value)
                            if (erroresVideo.titulo) {
                              setErroresVideo((prev) => ({ ...prev, titulo: '' }))
                            }
                          }}
                        />
                        {erroresVideo.titulo && (
                          <span className="campo-mensaje-error">{erroresVideo.titulo}</span>
                        )}
                      </div>

                      <div className="admin-form-fila">
                        <div className="campo-grupo">
                          <label htmlFor="modulo-destino-select" className="campo-etiqueta">
                            Módulo del curso
                          </label>
                          <select
                            id="modulo-destino-select"
                            className="campo-input"
                            value={moduloDestinoId}
                            onChange={(e) => setModuloDestinoId(Number(e.target.value))}
                          >
                            {modulosCursoVideo.map((m) => (
                              <option key={m.id} value={m.id}>
                                Módulo {m.id}: {m.titulo}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="campo-grupo">
                          <label htmlFor="duracion-detectada-input" className="campo-etiqueta">
                            Duración (segundos)
                          </label>
                          <input
                            id="duracion-detectada-input"
                            type="number"
                            min="10"
                            className="campo-input"
                            value={duracionDetectada}
                            onChange={(e) => setDuracionDetectada(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* CONSTRUCTOR DE CHECKPOINTS Y PREGUNTAS INTERACTIVAS             */}
                  {/* ============================================================== */}
                  <div className="seccion-checkpoints-builder">
                    <div className="seccion-subcabecera">
                      <div>
                        <h3>Preguntas y checkpoints interactivos</h3>
                        <p className="texto-suave">
                          El video se detendrá automáticamente en el tiempo indicado para que el estudiante responda.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="boton boton-claro"
                        onClick={agregarCheckpoint}
                      >
                        + Agregar pregunta / checkpoint
                      </button>
                    </div>

                    {checkpoints.length === 0 ? (
                      <p className="texto-suave mensaje-vacio-checkpoints">
                        No hay preguntas programadas para este video. Pulsa "+ Agregar pregunta / checkpoint" para crear una parada interactiva.
                      </p>
                    ) : (
                      <div className="checkpoints-lista">
                        {checkpoints.map((cp, cpIdx) => {
                          const tiempoCp = Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0)
                          const duracionLimite = Number(duracionDetectada) || 0
                          const fueraDeLimite = duracionLimite > 0 && tiempoCp >= duracionLimite

                          return (
                            <div key={cp.id || cpIdx} className="checkpoint-card">
                              <div className="checkpoint-card-header">
                                <span className="checkpoint-badge">Pregunta #{cpIdx + 1}</span>

                                <div className="checkpoint-tiempo-control">
                                  <span className="tiempo-label">Segundo o minuto de parada:</span>
                                  <div className="tiempo-inputs-inline">
                                    <input
                                      type="number"
                                      min="0"
                                      className={`campo-input input-tiempo ${
                                        erroresVideo[`cp_tiempo_${cpIdx}`] || fueraDeLimite ? 'con-error' : ''
                                      }`}
                                      value={cp.minuto}
                                      title="Minuto de parada"
                                      onChange={(e) =>
                                        actualizarCheckpoint(cpIdx, 'minuto', Math.max(0, Number(e.target.value) || 0))
                                      }
                                    />
                                    <span>min</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="59"
                                      className={`campo-input input-tiempo ${
                                        erroresVideo[`cp_tiempo_${cpIdx}`] || fueraDeLimite ? 'con-error' : ''
                                      }`}
                                      value={cp.segundo}
                                      title="Segundo de parada"
                                      onChange={(e) =>
                                        actualizarCheckpoint(cpIdx, 'segundo', Math.max(0, Number(e.target.value) || 0))
                                      }
                                    />
                                    <span>seg</span>
                                    {previsualizacionUrl && (
                                      <button
                                        type="button"
                                        className="boton-tiempo-actual"
                                        title="Usar la posición actual del reproductor de vista previa"
                                        onClick={() => capturarTiempoActualPreview(cpIdx)}
                                      >
                                        Fijar tiempo actual
                                      </button>
                                    )}
                                  </div>
                                  <span className="tiempo-duracion-max">
                                    Límite: {formatoTiempo(duracionDetectada)} ({duracionDetectada}s)
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className="boton-eliminar-item"
                                  title="Eliminar checkpoint"
                                  onClick={() => eliminarCheckpoint(cpIdx)}
                                >
                                  Eliminar
                                </button>
                              </div>

                              {erroresVideo[`cp_tiempo_${cpIdx}`] ? (
                                <div className="checkpoint-error-tiempo">
                                  <span className="campo-mensaje-error">
                                    {erroresVideo[`cp_tiempo_${cpIdx}`]}
                                  </span>
                                </div>
                              ) : fueraDeLimite ? (
                                <div className="checkpoint-error-tiempo">
                                  <span className="campo-mensaje-error">
                                    No se pueden agregar preguntas fuera de los límites del propio video ({formatoTiempo(duracionLimite)}). Este checkpoint está configurado en {formatoTiempo(tiempoCp)} ({tiempoCp}s).
                                  </span>
                                </div>
                              ) : null}

                              <div className="checkpoint-card-cuerpo">
                              <div className="campo-grupo">
                                <label className="campo-etiqueta">
                                  Pregunta para el estudiante *
                                </label>
                                <input
                                  type="text"
                                  className={`campo-input ${
                                    erroresVideo[`cp_${cpIdx}`] ? 'con-error' : ''
                                  }`}
                                  placeholder="Ej: ¿Qué devuelve una función de componente en React?"
                                  value={cp.pregunta}
                                  onChange={(e) =>
                                    actualizarCheckpoint(cpIdx, 'pregunta', e.target.value)
                                  }
                                />
                                {erroresVideo[`cp_${cpIdx}`] && (
                                  <span className="campo-mensaje-error">
                                    {erroresVideo[`cp_${cpIdx}`]}
                                  </span>
                                )}
                              </div>

                              <div className="campo-grupo">
                                <label className="campo-etiqueta">
                                  Opciones de respuesta (marca el círculo de la respuesta correcta) *
                                </label>
                                {erroresVideo[`cp_op_${cpIdx}`] && (
                                  <span className="campo-mensaje-error">
                                    {erroresVideo[`cp_op_${cpIdx}`]}
                                  </span>
                                )}

                                <div className="opciones-respuestas-lista">
                                  {cp.opciones.map((op, opIdx) => (
                                    <div key={opIdx} className="opcion-respuesta-fila">
                                      <input
                                        type="radio"
                                        id={`radio-${cpIdx}-${opIdx}`}
                                        name={`correcta-${cpIdx}`}
                                        checked={Number(cp.correcta) === opIdx}
                                        onChange={() =>
                                          actualizarCheckpoint(cpIdx, 'correcta', opIdx)
                                        }
                                        title="Marcar como respuesta correcta"
                                      />
                                      <input
                                        type="text"
                                        className="campo-input input-opcion-texto"
                                        placeholder={`Opción de respuesta ${opIdx + 1}`}
                                        value={op}
                                        onChange={(e) =>
                                          actualizarOpcion(cpIdx, opIdx, e.target.value)
                                        }
                                      />
                                      {cp.opciones.length > 2 && (
                                        <button
                                          type="button"
                                          className="boton-quitar-opcion"
                                          title="Quitar opción"
                                          onClick={() => eliminarOpcion(cpIdx, opIdx)}
                                        >
                                          Quitar
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {cp.opciones.length < 6 && (
                                  <button
                                    type="button"
                                    className="boton-texto-mas"
                                    onClick={() => agregarOpcion(cpIdx)}
                                  >
                                    + Agregar otra opción de respuesta
                                  </button>
                                )}
                              </div>

                              <div className="campo-grupo">
                                <label className="campo-etiqueta">
                                  Explicación formativa al acertar (opcional)
                                </label>
                                <input
                                  type="text"
                                  className="campo-input"
                                  placeholder="Ej: Un componente devuelve elementos JSX que describen lo que se verá en pantalla."
                                  value={cp.explicacion}
                                  onChange={(e) =>
                                    actualizarCheckpoint(cpIdx, 'explicacion', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      </div>
                    )}
                  </div>

                  <div className="admin-form-fila">
                    <div className="campo-grupo">
                      <label htmlFor="video-calidad-select" className="campo-etiqueta">
                        Resolución
                      </label>
                      <select
                        id="video-calidad-select"
                        className="campo-input"
                        value={calidadVideo}
                        onChange={(e) => setCalidadVideo(e.target.value)}
                      >
                        <option value="1080">Full HD (1080p)</option>
                        <option value="720">HD (720p)</option>
                        <option value="480">Estándar (480p)</option>
                      </select>
                    </div>

                    <div className="campo-grupo">
                      <label htmlFor="video-subtitulos-input" className="campo-etiqueta">
                        Subtítulos (opcional)
                      </label>
                      <input
                        id="video-subtitulos-input"
                        type="text"
                        className="campo-input"
                        placeholder="Archivo o pista .vtt"
                      />
                    </div>
                  </div>

                  <div className="botones-formulario-video">
                    <button
                      type="submit"
                      className="boton boton-crear-curso"
                      disabled={guardandoVideo}
                    >
                      {guardandoVideo
                        ? 'Guardando video y preguntas...'
                        : editandoVideoLeccionId
                        ? 'Actualizar video y preguntas'
                        : 'Guardar y vincular video'}
                    </button>
                    {editandoVideoLeccionId && (
                      <button
                        type="button"
                        className="boton boton-claro"
                        onClick={cancelarEdicionVideo}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  {erroresVideo.general && (
                    <span className="campo-mensaje-error texto-centrado-bloque">
                      {erroresVideo.general}
                    </span>
                  )}
                </form>
              </section>

              {/* Panel lateral informativo sobre el curso seleccionado */}
              <aside className="admin-seccion-preview">
                <h2>Curso seleccionado</h2>
                <p className="texto-suave">Información de la línea donde se añadirá el recurso:</p>

                {cursoParaVideo && (
                  <article
                    className="admin-preview-tarjeta"
                    style={{ '--color-linea': cursoParaVideo.color }}
                  >
                    <div className="preview-tarjeta-cuerpo">
                      <span className="insignia">{cursoParaVideo.id}</span>
                      <div className="preview-tarjeta-info">
                        <h3>{cursoParaVideo.titulo}</h3>
                        <p className="texto-suave">{cursoParaVideo.descripcion}</p>
                        <p className="meta">
                          {cursoParaVideo.categoria} · {cursoParaVideo.nivel} ·{' '}
                          {leccionesCursoVideo.length} lecciones
                        </p>
                      </div>
                    </div>

                    <div className="preview-tarjeta-pie">
                      <span className="texto-suave">
                        {archivoVideo
                          ? `Archivo listo: ${archivoVideo.name}`
                          : videoActualReferencia
                          ? `Video actual asignado: ${videoActualReferencia}`
                          : 'Esperando selección de video...'}
                      </span>
                    </div>
                  </article>
                )}
              </aside>
            </div>

            {/* Listado de lecciones y videos del curso seleccionado con opción de Editar */}
            <section className="admin-seccion-catalogo">
              <div className="catalogo-cabecera">
                <div>
                  <h2>Lecciones y videos en {cursoParaVideo?.titulo}</h2>
                  <p className="texto-suave">
                    Revisa y edita las grabaciones y checkpoints asignados a cada estación de este curso.
                  </p>
                </div>
              </div>

              <div className="lista-cursos">
                {leccionesCursoVideo.map((l) => {
                  const esPersonalizado = typeof l.video === 'string' && l.video.startsWith('idb:')
                  const cantPreguntas = l.cuestionarios?.length || 0
                  return (
                    <article
                      key={l.id}
                      className="fila-curso"
                      style={{ '--color-linea': cursoParaVideo?.color }}
                    >
                      <span className="insignia">{l.id}</span>

                      <div>
                        <h3>
                          {l.titulo}
                          {esPersonalizado && <span className="tag-nuevo">Video cargado</span>}
                        </h3>
                        <p className="texto-suave">
                          Fuente del video:{' '}
                          {esPersonalizado
                            ? 'Archivo cargado en el navegador (IndexedDB)'
                            : l.video}
                        </p>
                        <p className="meta">
                          Duración: {formatoTiempo(l.duracion)} · {cantPreguntas}{' '}
                          {cantPreguntas === 1 ? 'pregunta configurada' : 'preguntas configuradas'}
                        </p>
                      </div>

                      <div className="admin-acciones-curso">
                        <button
                          type="button"
                          className="boton boton-claro"
                          onClick={() => iniciarEdicionVideoLeccion(l, cursoParaVideo.id)}
                        >
                          Editar video y preguntas
                        </button>
                        <Link
                          to={`/aula/${cursoParaVideo.id}/${l.id}`}
                          className="boton boton-claro"
                        >
                          Ver en aula
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default Admin
