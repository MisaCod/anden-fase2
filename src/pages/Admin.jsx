import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BarraProgreso from '../components/BarraProgreso.jsx'
import EstrellasValoracion from '../components/EstrellasValoracion.jsx'
import TimelineCheckpoints from '../components/TimelineCheckpoints.jsx'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useCursos } from '../contextos/CursosContext.jsx'
import { formatoTiempo } from '../logica/formato.js'
import { leccionesDe } from '../logica/progreso.js'
import { apiFetch, subirVideoServidor } from '../servicios/api.js'

const PALETA_COLORES = [
  { nombre: 'Petróleo', hex: '#2f6f73' },
  { nombre: 'Coral', hex: '#e06d53' },
  { nombre: 'Menta', hex: '#6a9c89' },
  { nombre: 'Ámbar', hex: '#e59b34' },
  { nombre: 'Púrpura', hex: '#8e6c8a' },
  { nombre: 'Azul Eléctrico', hex: '#2563eb' },
]

const COLOR_POR_CATEGORIA = {
  Programación: '#2f6f73',
  Diseño: '#8e6c8a',
  Datos: '#e59b34',
}

const TIPOS_PREGUNTA = [
  { id: 'opcion_unica', label: 'Opción única' },
  { id: 'verdadero_falso', label: 'Verdadero / Falso' },
  { id: 'multiple_respuesta', label: 'Múltiple respuesta' },
  { id: 'completacion', label: 'Completación' },
  { id: 'desarrollo', label: 'Desarrollo (auto-evaluado)' },
]

function crearCheckpointBase(segundoTotal = 20) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    minuto: Math.floor(segundoTotal / 60),
    segundo: segundoTotal % 60,
    tipo: 'opcion_unica',
    pregunta: '',
    opciones: ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'],
    correcta: 0,
    correctas: [0, 1],
    respuestasAceptadasTexto: '',
    palabrasClaveTexto: '',
    minPalabras: 8,
    pista: '',
    explicacion: '',
  }
}

function normalizarCheckpointDesdeApi(q, idx = 0) {
  const tipo = q.tipo || 'opcion_unica'
  return {
    id: q.id || Date.now() + idx,
    minuto: Math.floor((q.segundo || 0) / 60),
    segundo: (q.segundo || 0) % 60,
    tipo,
    pregunta: q.pregunta || '',
    opciones:
      tipo === 'verdadero_falso'
        ? ['Verdadero', 'Falso']
        : Array.isArray(q.opciones) && q.opciones.length >= 2
        ? [...q.opciones]
        : ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4'],
    correcta: q.correcta !== undefined ? Number(q.correcta) : 0,
    correctas: Array.isArray(q.correctas) && q.correctas.length > 0 ? [...q.correctas] : [0],
    respuestasAceptadasTexto: Array.isArray(q.respuestasAceptadas)
      ? q.respuestasAceptadas.join(', ')
      : '',
    palabrasClaveTexto: Array.isArray(q.palabrasClave) ? q.palabrasClave.join(', ') : '',
    minPalabras: Number(q.minPalabras || 8),
    pista: q.pista || '',
    explicacion: q.explicacion || '',
  }
}

function serializarCheckpointParaApi(cp) {
  const segundo = Math.max(0, Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0))
  const tipo = cp.tipo || 'opcion_unica'
  const base = {
    id: cp.id && cp.id < 1_000_000_000_000 ? cp.id : null,
    segundo,
    tipo,
    pregunta: (cp.pregunta || '').trim(),
    explicacion: (cp.explicacion || '').trim(),
  }

  if (tipo === 'opcion_unica') {
    base.opciones = (cp.opciones || []).map((o) => o.trim()).filter(Boolean)
    base.correcta = Number(cp.correcta || 0)
  } else if (tipo === 'verdadero_falso') {
    base.opciones = ['Verdadero', 'Falso']
    base.correcta = Number(cp.correcta) === 1 ? 1 : 0
  } else if (tipo === 'multiple_respuesta') {
    base.opciones = (cp.opciones || []).map((o) => o.trim()).filter(Boolean)
    base.correctas = Array.isArray(cp.correctas) ? cp.correctas.map(Number) : [0]
  } else if (tipo === 'completacion') {
    base.respuestasAceptadas = (cp.respuestasAceptadasTexto || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    base.pista = (cp.pista || '').trim()
  } else if (tipo === 'desarrollo') {
    base.palabrasClave = (cp.palabrasClaveTexto || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    base.minPalabras = Math.max(3, Number(cp.minPalabras) || 8)
    base.pista = (cp.pista || '').trim()
  }

  return base
}

function Admin() {
  const { usuarioActual, cerrarSesion, esAdminGeneral } = useAuth()
  const {
    cursos,
    agregarCurso,
    editarCurso,
    eliminarCurso,
    actualizarVideoLeccion,
    agregarLeccionConVideo,
  } = useCursos()
  const navigate = useNavigate()

  // Pestañas: 'cursos' | 'videos' | 'solicitudes' | 'usuarios'
  const [pestanaActiva, setPestanaActiva] = useState('cursos')
  const [valoracionDocente, setValoracionDocente] = useState(
    () => usuarioActual?.valoracionDocente || null
  )

  useEffect(() => {
    let activo = true
    apiFetch('/api/docente/valoracion')
      .then((res) => {
        if (activo && res) setValoracionDocente(res)
      })
      .catch(() => {})
    return () => {
      activo = false
    }
  }, [cursos])

  // ==================== CURSOS ====================
  const [cursoEditandoId, setCursoEditandoId] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('Programación')
  const [categoriaPersonalizada, setCategoriaPersonalizada] = useState('')
  const [nivel, setNivel] = useState('Principiante')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState('#2f6f73')
  const [tipoAcceso, setTipoAcceso] = useState('gratis')
  const [precio, setPrecio] = useState('14.99')
  const [umbralCertificado, setUmbralCertificado] = useState('70')
  const [prerequisitoCursoId, setPrerequisitoCursoId] = useState('')
  const [modulos, setModulos] = useState([
    {
      id: null,
      titulo: 'Módulo 1: Fundamentos',
      lecciones: [{ id: null, titulo: 'Introducción al curso', duracion: null, video: '/videos/101.mp4' }],
    },
  ])
  const [errores, setErrores] = useState({})
  const [mensajeExito, setMensajeExito] = useState('')
  const [guardandoCurso, setGuardandoCurso] = useState(false)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState(null)
  const seccionFormularioCursoRef = useRef(null)

  // ==================== VIDEOS Y CHECKPOINTS ====================
  const [cursoVideoId, setCursoVideoId] = useState(() => cursos[0]?.id || 1)
  const [modoAsignacion, setModoAsignacion] = useState('existente') // 'existente' | 'nueva'
  const [leccionVideoId, setLeccionVideoId] = useState('')
  const [videoActualReferencia, setVideoActualReferencia] = useState('')
  const [nuevoTituloLeccion, setNuevoTituloLeccion] = useState('')
  const [moduloDestinoId, setModuloDestinoId] = useState('')
  const [duracionDetectada, setDuracionDetectada] = useState(60)
  const [archivoVideo, setArchivoVideo] = useState(null)
  const [previsualizacionUrl, setPrevisualizacionUrl] = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [guardandoVideo, setGuardandoVideo] = useState(false)
  const [erroresVideo, setErroresVideo] = useState({})
  const [mensajeExitoVideo, setMensajeExitoVideo] = useState('')
  const [checkpoints, setCheckpoints] = useState([])
  const [checkpointActivo, setCheckpointActivo] = useState(null)

  const inputFileRef = useRef(null)
  const previewVideoRef = useRef(null)
  const seccionSubidaRef = useRef(null)

  // ==================== SOLICITUDES Y ACCESOS ====================
  const [solicitudes, setSolicitudes] = useState([])
  const [cargandoSolicitudes, setCargandoSolicitudes] = useState(false)
  const [mensajeAcceso, setMensajeAcceso] = useState('')
  const [manualUsuarioId, setManualUsuarioId] = useState('')
  const [manualCursoId, setManualCursoId] = useState('')

  // ==================== USUARIOS Y ROLES ====================
  const [usuariosLista, setUsuariosLista] = useState([])
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false)
  const [nuevoUserNombre, setNuevoUserNombre] = useState('')
  const [nuevoUserUsername, setNuevoUserUsername] = useState('')
  const [nuevoUserEmail, setNuevoUserEmail] = useState('')
  const [nuevoUserPassword, setNuevoUserPassword] = useState('')
  const [nuevoUserRol, setNuevoUserRol] = useState('profesor')
  const [mensajeUsuario, setMensajeUsuario] = useState('')
  const [errorUsuario, setErrorUsuario] = useState('')

  const cursosEditables = useMemo(
    () => (esAdminGeneral ? cursos : cursos.filter((c) => c.puedeEditar)),
    [cursos, esAdminGeneral]
  )

  // Sincronizar cursoVideoId cuando cargan los cursos editables por este usuario
  useEffect(() => {
    if (cursosEditables.length > 0 && !cursosEditables.some((c) => c.id === Number(cursoVideoId))) {
      setCursoVideoId(cursosEditables[0].id)
    }
  }, [cursosEditables, cursoVideoId])

  const cursoParaVideo =
    cursosEditables.find((c) => Number(c.id) === Number(cursoVideoId)) || cursosEditables[0] || null
  const leccionesCursoVideo = cursoParaVideo ? leccionesDe(cursoParaVideo) : []
  const modulosCursoVideo = useMemo(
    () => (cursoParaVideo ? cursoParaVideo.modulos : []),
    [cursoParaVideo]
  )

  // Mantener moduloDestinoId válido
  useEffect(() => {
    if (modulosCursoVideo.length > 0 && !modulosCursoVideo.some((m) => m.id === Number(moduloDestinoId))) {
      setModuloDestinoId(modulosCursoVideo[0].id)
    }
  }, [modulosCursoVideo, moduloDestinoId])

  // Cargar primera lección automáticamente cuando cambia el curso en modo existente
  useEffect(() => {
    if (pestanaActiva === 'videos' && modoAsignacion === 'existente' && leccionesCursoVideo.length > 0) {
      const existe = leccionesCursoVideo.some((l) => Number(l.id) === Number(leccionVideoId))
      if (!existe) {
        cargarLeccionEnEditor(leccionesCursoVideo[0])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestanaActiva, cursoVideoId, modoAsignacion])

  const cargarSolicitudesYEstudiantes = useCallback(async () => {
    setCargandoSolicitudes(true)
    try {
      const [sols, usrs] = await Promise.all([
        apiFetch('/api/admin/solicitudes'),
        apiFetch('/api/admin/usuarios'),
      ])
      setSolicitudes(Array.isArray(sols) ? sols : [])
      setUsuariosLista(Array.isArray(usrs) ? usrs : [])
    } catch {
      // Ignorar si hubo fallo transitorio
    } finally {
      setCargandoSolicitudes(false)
    }
  }, [])

  const cargarUsuarios = useCallback(async () => {
    setCargandoUsuarios(true)
    try {
      const usrs = await apiFetch('/api/admin/usuarios')
      setUsuariosLista(Array.isArray(usrs) ? usrs : [])
    } catch {
      // Ignorar
    } finally {
      setCargandoUsuarios(false)
    }
  }, [])

  useEffect(() => {
    if (pestanaActiva === 'solicitudes') {
      cargarSolicitudesYEstudiantes()
    } else if (pestanaActiva === 'usuarios' && esAdminGeneral) {
      cargarUsuarios()
    }
  }, [pestanaActiva, esAdminGeneral, cargarSolicitudesYEstudiantes, cargarUsuarios])

  useEffect(() => {
    return () => {
      if (previsualizacionUrl && previsualizacionUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previsualizacionUrl)
      }
    }
  }, [previsualizacionUrl])

  function handleLogout() {
    cerrarSesion()
    navigate('/')
  }

  // ==================== HANDLERS CURSOS ====================
  function cambiarCategoria(nuevaCat) {
    setCategoria(nuevaCat)
    if (!cursoEditandoId && COLOR_POR_CATEGORIA[nuevaCat]) {
      setColor(COLOR_POR_CATEGORIA[nuevaCat])
    }
  }

  function agregarModulo() {
    setModulos((prev) => [
      ...prev,
      {
        id: null,
        titulo: `Módulo ${prev.length + 1}: Nuevo tema`,
        lecciones: [{ id: null, titulo: 'Nueva lección', duracion: null, video: '/videos/101.mp4' }],
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
      const n = copia[mIndex].lecciones.length + 1
      copia[mIndex].lecciones.push({
        id: null,
        titulo: `Lección ${n}`,
        duracion: null,
        video: '/videos/101.mp4',
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

  function cancelarEdicionCurso() {
    setCursoEditandoId(null)
    setTitulo('')
    setCategoria('Programación')
    setCategoriaPersonalizada('')
    setNivel('Principiante')
    setDescripcion('')
    setColor('#2f6f73')
    setTipoAcceso('gratis')
    setPrecio('14.99')
    setUmbralCertificado('70')
    setPrerequisitoCursoId('')
    setModulos([
      {
        id: null,
        titulo: 'Módulo 1: Fundamentos',
        lecciones: [{ id: null, titulo: 'Introducción al curso', duracion: null, video: '/videos/101.mp4' }],
      },
    ])
    setErrores({})
  }

  function iniciarEdicionCurso(curso) {
    setCursoEditandoId(curso.id)
    setTitulo(curso.titulo)
    const catsBase = ['Programación', 'Diseño', 'Datos']
    if (catsBase.includes(curso.categoria)) {
      setCategoria(curso.categoria)
      setCategoriaPersonalizada('')
    } else {
      setCategoria('otra')
      setCategoriaPersonalizada(curso.categoria)
    }
    setNivel(curso.nivel)
    setDescripcion(curso.descripcion)
    setColor(curso.color)
    setTipoAcceso(curso.tipoAcceso || 'gratis')
    setPrecio(String(curso.precio || 0))
    setUmbralCertificado(String(curso.umbralCertificado || 70))
    setPrerequisitoCursoId(curso.prerequisitoCursoId ? String(curso.prerequisitoCursoId) : '')
    setModulos(
      curso.modulos.map((m) => ({
        id: m.id,
        titulo: m.titulo,
        lecciones: m.lecciones.map((l) => ({
          id: l.id,
          titulo: l.titulo,
          duracion: l.duracion,
          video: l.video,
        })),
      }))
    )
    setErrores({})
    setMensajeExito('')
    seccionFormularioCursoRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleGuardarCurso(e) {
    e.preventDefault()
    setMensajeExito('')
    const catFinal = categoria === 'otra' ? categoriaPersonalizada.trim() : categoria
    const nuevosErrores = {}
    if (!titulo.trim()) nuevosErrores.titulo = 'El título es obligatorio.'
    if (!descripcion.trim()) nuevosErrores.descripcion = 'La descripción es obligatoria.'
    if (!catFinal) nuevosErrores.categoria = 'Especifica la categoría.'

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores)
      return
    }

    setErrores({})
    setGuardandoCurso(true)

    const payload = {
      titulo: titulo.trim(),
      categoria: catFinal,
      nivel,
      descripcion: descripcion.trim(),
      color,
      tipoAcceso,
      precio: tipoAcceso === 'restringido' ? Math.max(0, Number(precio) || 0) : 0,
      umbralCertificado: Math.min(100, Math.max(10, Number(umbralCertificado) || 70)),
      prerequisitoCursoId: prerequisitoCursoId ? Number(prerequisitoCursoId) : null,
      modulos: modulos.map((m) => ({
        id: m.id || null,
        titulo: m.titulo.trim() || 'Módulo',
        lecciones: m.lecciones.map((l) => ({
          id: l.id || null,
          titulo: l.titulo.trim() || 'Lección',
          duracion: l.id && l.duracion ? Number(l.duracion) : null,
          video: l.video || '/videos/101.mp4',
        })),
      })),
    }

    const res = cursoEditandoId
      ? await editarCurso(cursoEditandoId, payload)
      : await agregarCurso(payload)

    setGuardandoCurso(false)
    if (!res.ok) {
      setErrores({ general: res.error })
      return
    }

    setMensajeExito(
      cursoEditandoId
        ? `Curso "${payload.titulo}" actualizado en SQLite.`
        : `Curso "${payload.titulo}" creado correctamente en SQLite.`
    )
    cancelarEdicionCurso()
  }

  async function handleConfirmarEliminar(cursoId) {
    const res = await eliminarCurso(cursoId)
    setConfirmandoEliminarId(null)
    if (res.ok) {
      if (cursoEditandoId === cursoId) cancelarEdicionCurso()
      setMensajeExito('Curso eliminado correctamente.')
    }
  }

  // ==================== HANDLERS VIDEOS Y CHECKPOINTS ====================
  function cargarLeccionEnEditor(lecc) {
    if (!lecc) return
    setLeccionVideoId(lecc.id)
    setDuracionDetectada(lecc.duracion || 60)
    setVideoActualReferencia(lecc.video || '')
    setArchivoVideo(null)
    if (previsualizacionUrl && previsualizacionUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previsualizacionUrl)
    }
    setPrevisualizacionUrl(null)
    const cps = (lecc.cuestionarios || []).map((q, idx) => normalizarCheckpointDesdeApi(q, idx))
    setCheckpoints(cps)
    setCheckpointActivo(cps.length > 0 ? 0 : null)
    setErroresVideo({})
  }

  function procesarArchivoVideo(file) {
    if (!file) return
    const esExtValida = /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.name)
    if (!esExtValida && !file.type.startsWith('video/')) {
      setErroresVideo((prev) => ({
        ...prev,
        archivo: 'Formato no soportado. Usa .mp4, .webm, .ogg, .mov o .mkv.',
      }))
      return
    }
    if (previsualizacionUrl && previsualizacionUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previsualizacionUrl)
    }
    setArchivoVideo(file)
    setPrevisualizacionUrl(URL.createObjectURL(file))
    setErroresVideo((prev) => ({ ...prev, archivo: '' }))
  }

  function agregarCheckpointEnSegundo(segundoTotal = 20) {
    const seguro = Math.min(Math.max(1, segundoTotal), Math.max(1, Number(duracionDetectada || 60) - 1))
    const nuevo = crearCheckpointBase(seguro)
    setCheckpoints((prev) => {
      const lista = [...prev, nuevo]
      setCheckpointActivo(lista.length - 1)
      return lista
    })
  }

  function moverCheckpointASegundo(cpIndex, segundoTotal) {
    const seg = Math.max(0, Math.min(segundoTotal, Math.max(1, Number(duracionDetectada || 60) - 1)))
    setCheckpoints((prev) => {
      if (!prev[cpIndex]) return prev
      const copia = structuredClone(prev)
      copia[cpIndex].minuto = Math.floor(seg / 60)
      copia[cpIndex].segundo = seg % 60
      return copia
    })
  }

  function eliminarCheckpoint(cpIndex) {
    setCheckpoints((prev) => prev.filter((_, idx) => idx !== cpIndex))
    setCheckpointActivo((prev) => (prev === cpIndex ? null : prev > cpIndex ? prev - 1 : prev))
  }

  function actualizarCheckpoint(cpIndex, campo, valor) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      copia[cpIndex][campo] = valor
      if (campo === 'tipo') {
        if (valor === 'verdadero_falso') {
          copia[cpIndex].opciones = ['Verdadero', 'Falso']
          copia[cpIndex].correcta = 0
        } else if (valor === 'opcion_unica' || valor === 'multiple_respuesta') {
          if (!Array.isArray(copia[cpIndex].opciones) || copia[cpIndex].opciones.length < 2) {
            copia[cpIndex].opciones = ['Opción 1', 'Opción 2', 'Opción 3', 'Opción 4']
          }
          if (valor === 'multiple_respuesta' && (!copia[cpIndex].correctas || copia[cpIndex].correctas.length === 0)) {
            copia[cpIndex].correctas = [0]
          }
        }
      }
      return copia
    })
  }

  function alternarCorrectaMultiple(cpIndex, opIdx) {
    setCheckpoints((prev) => {
      const copia = structuredClone(prev)
      const actual = Array.isArray(copia[cpIndex].correctas) ? copia[cpIndex].correctas : []
      if (actual.includes(opIdx)) {
        if (actual.length > 1) {
          copia[cpIndex].correctas = actual.filter((i) => i !== opIdx)
        }
      } else {
        copia[cpIndex].correctas = [...actual, opIdx].sort((a, b) => a - b)
      }
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
        if (copia[cpIndex].correcta >= copia[cpIndex].opciones.length) copia[cpIndex].correcta = 0
        copia[cpIndex].correctas = (copia[cpIndex].correctas || [])
          .filter((i) => i !== opIndex)
          .map((i) => (i > opIndex ? i - 1 : i))
        if (copia[cpIndex].correctas.length === 0) copia[cpIndex].correctas = [0]
      }
      return copia
    })
  }

  async function handleGuardarVideoYCheckpoints(e) {
    e.preventDefault()
    setErroresVideo({})
    setMensajeExitoVideo('')

    if (modoAsignacion === 'existente' && !leccionVideoId) {
      setErroresVideo({ leccion: 'Selecciona una lección.' })
      return
    }
    if (modoAsignacion === 'nueva' && !nuevoTituloLeccion.trim()) {
      setErroresVideo({ titulo: 'Escribe el título de la nueva lección.' })
      return
    }

    const dur = Math.max(5, Number(duracionDetectada) || 60)
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i]
      const seg = Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0)
      if (seg >= dur) {
        setErroresVideo({
          general: `La pregunta #${i + 1} (${formatoTiempo(seg)}) supera la duración del video (${formatoTiempo(dur)}).`,
        })
        return
      }
      if (!cp.pregunta.trim()) {
        setErroresVideo({ general: `Escribe el enunciado de la pregunta #${i + 1}.` })
        return
      }
      if (cp.tipo === 'completacion' && !(cp.respuestasAceptadasTexto || '').trim()) {
        setErroresVideo({ general: `Indica al menos una respuesta aceptada en la pregunta #${i + 1}.` })
        return
      }
    }

    setGuardandoVideo(true)
    try {
      let videoFinal = videoActualReferencia || '/videos/101.mp4'
      if (archivoVideo) {
        const up = await subirVideoServidor(archivoVideo)
        videoFinal = up.videoUrl
      }

      const cuestionariosPayload = checkpoints.map(serializarCheckpointParaApi)

      const res =
        modoAsignacion === 'existente'
          ? await actualizarVideoLeccion(
              cursoVideoId,
              Number(leccionVideoId),
              videoFinal,
              dur,
              cuestionariosPayload
            )
          : await agregarLeccionConVideo(cursoVideoId, Number(moduloDestinoId), {
              titulo: nuevoTituloLeccion.trim(),
              duracion: dur,
              video: videoFinal,
              cuestionarios: cuestionariosPayload,
            })

      if (!res.ok) {
        setErroresVideo({ general: res.error })
        return
      }

      setVideoActualReferencia(videoFinal)
      setArchivoVideo(null)
      if (previsualizacionUrl && previsualizacionUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previsualizacionUrl)
      }
      setPrevisualizacionUrl(null)
      setMensajeExitoVideo(
        modoAsignacion === 'existente'
          ? `Lección actualizada en SQLite con ${cuestionariosPayload.length} preguntas.`
          : `Nueva lección "${nuevoTituloLeccion.trim()}" creada con ${cuestionariosPayload.length} preguntas.`
      )
      if (modoAsignacion === 'nueva') {
        setNuevoTituloLeccion('')
        setCheckpoints([])
        setCheckpointActivo(null)
      }
    } catch (err) {
      setErroresVideo({ general: err.message || 'Error al guardar el video.' })
    } finally {
      setGuardandoVideo(false)
    }
  }

  // ==================== HANDLERS SOLICITUDES Y ACCESOS ====================
  async function handleResolverSolicitud(id, estado) {
    setMensajeAcceso('')
    try {
      await apiFetch(`/api/admin/solicitudes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado }),
      })
      setMensajeAcceso(estado === 'aprobado' ? 'Acceso aprobado correctamente.' : 'Solicitud rechazada.')
      await cargarSolicitudesYEstudiantes()
    } catch (err) {
      setMensajeAcceso(err.message)
    }
  }

  async function handleOtorgarManual(e) {
    e.preventDefault()
    if (!manualUsuarioId || !manualCursoId) return
    setMensajeAcceso('')
    try {
      await apiFetch('/api/admin/accesos/otorgar', {
        method: 'POST',
        body: JSON.stringify({
          usuarioId: Number(manualUsuarioId),
          cursoId: Number(manualCursoId),
          estado: 'aprobado',
        }),
      })
      setMensajeAcceso('Permiso otorgado correctamente al estudiante.')
      await cargarSolicitudesYEstudiantes()
    } catch (err) {
      setMensajeAcceso(err.message)
    }
  }

  // ==================== HANDLERS USUARIOS (ADMIN GENERAL) ====================
  async function handleCrearUsuario(e) {
    e.preventDefault()
    setMensajeUsuario('')
    setErrorUsuario('')
    try {
      const res = await apiFetch('/api/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nuevoUserNombre.trim(),
          username: nuevoUserUsername.trim().toLowerCase(),
          email: nuevoUserEmail.trim() || null,
          password: nuevoUserPassword.trim(),
          rol: nuevoUserRol,
        }),
      })
      setMensajeUsuario(`Cuenta "${res.usuario.username}" (${res.usuario.rol}) creada correctamente.`)
      setNuevoUserNombre('')
      setNuevoUserUsername('')
      setNuevoUserEmail('')
      setNuevoUserPassword('')
      await cargarUsuarios()
    } catch (err) {
      setErrorUsuario(err.message || 'No se pudo crear el usuario.')
    }
  }

  async function handleCambiarEstadoUsuario(u) {
    setErrorUsuario('')
    try {
      await apiFetch(`/api/admin/usuarios/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !u.activo }),
      })
      await cargarUsuarios()
    } catch (err) {
      setErrorUsuario(err.message)
    }
  }

  const cursosFiltrados = cursos.filter((c) => {
    const q = filtroTexto.trim().toLowerCase()
    if (!q) return true
    return (
      c.titulo.toLowerCase().includes(q) ||
      c.categoria.toLowerCase().includes(q) ||
      c.descripcion.toLowerCase().includes(q)
    )
  })

  const videoPreviewSrc = previsualizacionUrl || videoActualReferencia || ''
  const solicitudesPendientes = solicitudes.filter((s) => s.estado === 'pendiente').length
  const estudiantesLista = usuariosLista.filter((u) => u.rol === 'estudiante')
  const cursosRestringidos = cursosEditables.filter((c) => c.tipoAcceso === 'restringido')

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header-contenido">
          <div className="admin-marca">
            <span className="logo-punto"></span>
            andén
            <span className="badge-admin">{esAdminGeneral ? 'ADMIN GENERAL' : 'PROFESOR'}</span>
          </div>

          <div className="admin-header-acciones">
            <Link to="/cursos" className="boton-enlace-estudiante">
              Ver vista estudiante
            </Link>
            <div className="admin-perfil">
              <span className="avatar avatar-admin">{usuarioActual?.iniciales || 'AD'}</span>
              <span className="admin-nombre">{usuarioActual?.nombre}</span>
            </div>
            <button type="button" className="boton-cerrar-sesion" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="admin-contenedor">
        <div className="admin-encabezado-pagina admin-perfil-resumen">
          <div>
            <h1>{esAdminGeneral ? 'Panel de Administración General' : 'Panel de Profesor'}</h1>
            <p className="texto-suave">
              Gestiona cursos, prelaciones, videos con checkpoints interactivos en la línea de tiempo y permisos de acceso.
            </p>
          </div>

          <div className="admin-perfil-tarjeta">
            <p className="admin-perfil-titulo">Perfil docente: {usuarioActual?.nombre}</p>
            <div className="admin-perfil-valoracion">
              <EstrellasValoracion
                valor={valoracionDocente?.promedio ?? null}
                tamano="sm"
                etiquetaVacia="Sin videos valorados"
              />
            </div>
            <p className="texto-suave admin-perfil-detalle">
              Promedio calculado sobre {valoracionDocente?.videosValorados || 0} de{' '}
              {valoracionDocente?.totalVideos || 0} videos
              {valoracionDocente?.totalValoraciones
                ? ` (${valoracionDocente.totalValoraciones} valoraciones)`
                : ''}
            </p>
          </div>
        </div>

        <div className="admin-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestanaActiva === 'cursos'}
            className={`admin-tab ${pestanaActiva === 'cursos' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('cursos')}
          >
            Cursos ({cursos.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestanaActiva === 'videos'}
            className={`admin-tab ${pestanaActiva === 'videos' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('videos')}
          >
            Videos y Checkpoints
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestanaActiva === 'solicitudes'}
            className={`admin-tab ${pestanaActiva === 'solicitudes' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('solicitudes')}
          >
            Solicitudes y Accesos {solicitudesPendientes > 0 ? `(${solicitudesPendientes})` : ''}
          </button>
          {esAdminGeneral && (
            <button
              type="button"
              role="tab"
              aria-selected={pestanaActiva === 'usuarios'}
              className={`admin-tab ${pestanaActiva === 'usuarios' ? 'activa' : ''}`}
              onClick={() => setPestanaActiva('usuarios')}
            >
              Usuarios y Roles
            </button>
          )}
        </div>

        {/* ==================== PESTAÑA 1: CURSOS ==================== */}
        {pestanaActiva === 'cursos' && (
          <div className="admin-grid">
            <section ref={seccionFormularioCursoRef} className="admin-tarjeta">
              <h2>{cursoEditandoId ? 'Editar curso' : 'Agregar nuevo curso'}</h2>

              {mensajeExito && <div className="alerta-exito">{mensajeExito}</div>}
              {errores.general && <div className="alerta-error">{errores.general}</div>}

              <form onSubmit={handleGuardarCurso} className="admin-formulario">
                <div className="campo-grupo">
                  <label htmlFor="curso-titulo" className="campo-etiqueta">Título del curso *</label>
                  <input
                    id="curso-titulo"
                    type="text"
                    className={`campo-input ${errores.titulo ? 'con-error' : ''}`}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej: JavaScript moderno"
                  />
                  {errores.titulo && <span className="campo-mensaje-error">{errores.titulo}</span>}
                </div>

                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="curso-categoria" className="campo-etiqueta">Categoría</label>
                    <select
                      id="curso-categoria"
                      className="campo-input"
                      value={categoria}
                      onChange={(e) => cambiarCategoria(e.target.value)}
                    >
                      <option value="Programación">Programación</option>
                      <option value="Diseño">Diseño</option>
                      <option value="Datos">Datos</option>
                      <option value="otra">Otra categoría…</option>
                    </select>
                  </div>

                  <div className="campo-grupo">
                    <label htmlFor="curso-nivel" className="campo-etiqueta">Nivel</label>
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

                {categoria === 'otra' && (
                  <div className="campo-grupo">
                    <label htmlFor="curso-cat-custom" className="campo-etiqueta">Nombre de la categoría *</label>
                    <input
                      id="curso-cat-custom"
                      type="text"
                      className="campo-input"
                      value={categoriaPersonalizada}
                      onChange={(e) => setCategoriaPersonalizada(e.target.value)}
                      placeholder="Ej: Seguridad Informática"
                    />
                  </div>
                )}

                <div className="campo-grupo">
                  <label htmlFor="curso-desc" className="campo-etiqueta">Descripción *</label>
                  <textarea
                    id="curso-desc"
                    rows="2"
                    className={`campo-input campo-textarea ${errores.descripcion ? 'con-error' : ''}`}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Qué aprenderá el estudiante en este curso…"
                  />
                  {errores.descripcion && <span className="campo-mensaje-error">{errores.descripcion}</span>}
                </div>

                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="curso-acceso" className="campo-etiqueta">Tipo de acceso</label>
                    <select
                      id="curso-acceso"
                      className="campo-input"
                      value={tipoAcceso}
                      onChange={(e) => setTipoAcceso(e.target.value)}
                    >
                      <option value="gratis">Gratis (abierto a todos)</option>
                      <option value="restringido">Restringido (permiso admin / pago simulado)</option>
                    </select>
                  </div>

                  {tipoAcceso === 'restringido' && (
                    <div className="campo-grupo">
                      <label htmlFor="curso-precio" className="campo-etiqueta">Precio simulado (USD)</label>
                      <input
                        id="curso-precio"
                        type="number"
                        step="0.01"
                        min="0"
                        className="campo-input"
                        value={precio}
                        onChange={(e) => setPrecio(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="curso-prereq" className="campo-etiqueta">
                      Prelación / curso prerrequisito (opcional)
                    </label>
                    <select
                      id="curso-prereq"
                      className="campo-input"
                      value={prerequisitoCursoId}
                      onChange={(e) => setPrerequisitoCursoId(e.target.value)}
                    >
                      <option value="">Ninguno (acceso sin prelación)</option>
                      {cursos
                        .filter((c) => c.id !== cursoEditandoId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.titulo} ({c.categoria})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="campo-grupo">
                    <label htmlFor="curso-umbral" className="campo-etiqueta">
                      % mínimo de aciertos para certificado
                    </label>
                    <input
                      id="curso-umbral"
                      type="number"
                      min="10"
                      max="100"
                      className="campo-input"
                      value={umbralCertificado}
                      onChange={(e) => setUmbralCertificado(e.target.value)}
                    />
                  </div>
                </div>

                <div className="campo-grupo">
                  <span className="campo-etiqueta">Color y ambiente del curso (afecta línea, fondo y reproductor)</span>
                  <div className="paleta-colores">
                    {PALETA_COLORES.map((item) => (
                      <button
                        key={item.hex}
                        type="button"
                        className={`color-opcion ${color === item.hex ? 'activo' : ''}`}
                        style={{ backgroundColor: item.hex }}
                        title={item.nombre}
                        onClick={() => setColor(item.hex)}
                        aria-label={item.nombre}
                      />
                    ))}
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      title="Elegir color personalizado"
                      className="color-picker-nativo"
                    />
                  </div>
                </div>

                <div className="campo-grupo">
                  <div className="seccion-subcabecera">
                    <div>
                      <h3>Módulos y lecciones</h3>
                      <p className="texto-suave" style={{ fontSize: '12px' }}>
                        La duración de cada lección se detecta automáticamente según su video real.
                      </p>
                    </div>
                    <button type="button" className="boton boton-claro" onClick={agregarModulo}>
                      + Módulo
                    </button>
                  </div>

                  {modulos.map((m, mIdx) => (
                    <div key={mIdx} className="modulo-editor-caja">
                      <div className="modulo-editor-cabecera">
                        <input
                          type="text"
                          className="campo-input"
                          value={m.titulo}
                          onChange={(e) => cambiarTituloModulo(mIdx, e.target.value)}
                          placeholder="Título del módulo"
                        />
                        {modulos.length > 1 && (
                          <button
                            type="button"
                            className="boton-eliminar-item"
                            onClick={() => eliminarModulo(mIdx)}
                          >
                            Quitar
                          </button>
                        )}
                      </div>

                      {m.lecciones.map((l, lIdx) => (
                        <div key={lIdx} className="leccion-editor-fila">
                          <input
                            type="text"
                            className="campo-input"
                            value={l.titulo}
                            onChange={(e) => cambiarLeccion(mIdx, lIdx, 'titulo', e.target.value)}
                            placeholder="Título de lección"
                          />
                          <span
                            className="badge-duracion-auto"
                            title="La duración se calcula automáticamente al cargar el video real"
                          >
                            {l.id && l.duracion ? formatoTiempo(l.duracion) : 'Auto'}
                          </span>
                          {m.lecciones.length > 1 && (
                            <button
                              type="button"
                              className="boton-quitar-opcion"
                              onClick={() => eliminarLeccion(mIdx, lIdx)}
                            >
                              ×
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
                  ))}
                </div>

                <div className="botones">
                  <button type="submit" className="boton" disabled={guardandoCurso}>
                    {guardandoCurso ? 'Guardando…' : cursoEditandoId ? 'Guardar cambios' : 'Crear curso'}
                  </button>
                  {cursoEditandoId && (
                    <button type="button" className="boton boton-claro" onClick={cancelarEdicionCurso}>
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="admin-columna-derecha">
              <div className="admin-tarjeta" style={{ '--color-linea': color }}>
                <h2>Vista previa del tema</h2>
                <div className="preview-tema-curso">
                  <div className="preview-tema-encabezado">
                    <span className="insignia" style={{ background: color }}>
                      {cursoEditandoId || cursos.length + 1}
                    </span>
                    <div>
                      <h3>{titulo.trim() || 'Título del curso'}</h3>
                      <p className="texto-suave">
                        {categoria === 'otra' ? categoriaPersonalizada || 'Categoría' : categoria} · {nivel} ·{' '}
                        {tipoAcceso === 'gratis' ? 'Gratis' : `Restringido ($${Number(precio || 0).toFixed(2)})`}
                      </p>
                    </div>
                  </div>
                  <BarraProgreso porcentaje={45} />
                </div>
              </div>

              <div className="admin-tarjeta">
                <div className="seccion-subcabecera">
                  <h2>Cursos actuales ({cursos.length})</h2>
                  <input
                    type="search"
                    className="campo-input input-busqueda-mini"
                    placeholder="Buscar curso…"
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                  />
                </div>

                <div className="admin-lista-cursos">
                  {cursosFiltrados.map((c) => (
                    <div key={c.id} className="admin-curso-item" style={{ '--color-linea': c.color }}>
                      <div>
                        <div className="admin-curso-titulo-row">
                          <span className="rama-color" style={{ background: c.color }} />
                          <strong>{c.titulo}</strong>
                          <span className={`etiqueta-acceso ${c.tipoAcceso === 'gratis' ? 'gratis' : 'restringido'}`}>
                            {c.tipoAcceso === 'gratis' ? 'Gratis' : `$${(c.precio || 0).toFixed(2)}`}
                          </span>
                        </div>
                        <p className="texto-suave">
                          {c.categoria} · {leccionesDe(c).length} lecciones · Cert. ≥ {c.umbralCertificado}%
                          {c.prerequisitoTitulo ? ` · Requiere: ${c.prerequisitoTitulo}` : ''}
                          {c.creadoPorNombre ? ` · Autor: ${c.creadoPorNombre}` : ''}
                          {' · '}
                          {c.valoracionPromedio != null
                            ? `Valoración: ${Number(c.valoracionPromedio).toFixed(1)} / 5 (${c.totalValoraciones})`
                            : 'Sin valoraciones'}
                        </p>
                      </div>

                      <div className="admin-curso-acciones">
                        {c.puedeEditar ? (
                          <>
                            <button type="button" className="boton boton-claro" onClick={() => iniciarEdicionCurso(c)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="boton boton-claro"
                              onClick={() => {
                                setCursoVideoId(c.id)
                                setModoAsignacion('existente')
                                const primera = leccionesDe(c)[0]
                                if (primera) cargarLeccionEnEditor(primera)
                                setPestanaActiva('videos')
                              }}
                            >
                              Videos
                            </button>
                            {confirmandoEliminarId === c.id ? (
                              <button
                                type="button"
                                className="boton-eliminar-item"
                                onClick={() => handleConfirmarEliminar(c.id)}
                              >
                                Confirmar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="boton-eliminar-item"
                                onClick={() => setConfirmandoEliminarId(c.id)}
                              >
                                Eliminar
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="etiqueta-solo-lectura">Solo lectura · otro profesor</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ==================== PESTAÑA 2: VIDEOS Y CHECKPOINTS ==================== */}
        {pestanaActiva === 'videos' && (
          <div ref={seccionSubidaRef} className="admin-tarjeta">
            <h2>Editor de Videos y Checkpoints Interactivos</h2>
            <p className="texto-suave" style={{ marginBottom: '16px' }}>
              Sube un video al servidor o edita una lección existente. Usa la barra interactiva para colocar o arrastrar cada pregunta al segundo exacto.
            </p>

            {mensajeExitoVideo && <div className="alerta-exito">{mensajeExitoVideo}</div>}
            {erroresVideo.general && <div className="alerta-error">{erroresVideo.general}</div>}

            {cursosEditables.length === 0 ? (
              <div className="alerta-info">
                Todavía no tienes cursos propios creados. Crea tu primer curso en la pestaña <strong>Cursos</strong> para subirle videos y checkpoints.
              </div>
            ) : (
            <form onSubmit={handleGuardarVideoYCheckpoints} className="admin-formulario">
              <div className="admin-form-fila">
                <div className="campo-grupo">
                  <label htmlFor="video-curso-select" className="campo-etiqueta">Curso *</label>
                  <select
                    id="video-curso-select"
                    className="campo-input"
                    value={cursoVideoId}
                    onChange={(e) => {
                      const nuevoCursoId = Number(e.target.value)
                      setCursoVideoId(nuevoCursoId)
                      const c = cursosEditables.find((x) => x.id === nuevoCursoId)
                      const primera = c ? leccionesDe(c)[0] : null
                      if (primera && modoAsignacion === 'existente') cargarLeccionEnEditor(primera)
                    }}
                  >
                    {cursosEditables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo} ({c.categoria})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo-grupo">
                  <label className="campo-etiqueta">Destino del video</label>
                  <div className="selector-modo-asignacion">
                    <label className={`modo-opcion ${modoAsignacion === 'existente' ? 'activo' : ''}`}>
                      <input
                        type="radio"
                        name="modo-video"
                        checked={modoAsignacion === 'existente'}
                        onChange={() => setModoAsignacion('existente')}
                      />
                      <span>Editar lección existente</span>
                    </label>
                    <label className={`modo-opcion ${modoAsignacion === 'nueva' ? 'activo' : ''}`}>
                      <input
                        type="radio"
                        name="modo-video"
                        checked={modoAsignacion === 'nueva'}
                        onChange={() => {
                          setModoAsignacion('nueva')
                          setCheckpoints([])
                          setCheckpointActivo(null)
                          setVideoActualReferencia('')
                        }}
                      />
                      <span>Crear nueva lección</span>
                    </label>
                  </div>
                </div>
              </div>

              {modoAsignacion === 'existente' ? (
                <div className="campo-grupo">
                  <label htmlFor="video-leccion-select" className="campo-etiqueta">Lección *</label>
                  <select
                    id="video-leccion-select"
                    className="campo-input"
                    value={leccionVideoId}
                    onChange={(e) => {
                      const l = leccionesCursoVideo.find((x) => x.id === Number(e.target.value))
                      if (l) cargarLeccionEnEditor(l)
                    }}
                  >
                    {leccionesCursoVideo.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id}: {l.titulo} ({formatoTiempo(l.duracion)} · {(l.cuestionarios || []).length} preguntas)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="nueva-lecc-titulo" className="campo-etiqueta">Título de la nueva lección *</label>
                    <input
                      id="nueva-lecc-titulo"
                      type="text"
                      className="campo-input"
                      value={nuevoTituloLeccion}
                      onChange={(e) => setNuevoTituloLeccion(e.target.value)}
                      placeholder="Ej: Consultas JOIN en SQL"
                    />
                  </div>
                  <div className="campo-grupo">
                    <label htmlFor="nueva-lecc-mod" className="campo-etiqueta">Módulo</label>
                    <select
                      id="nueva-lecc-mod"
                      className="campo-input"
                      value={moduloDestinoId}
                      onChange={(e) => setModuloDestinoId(Number(e.target.value))}
                    >
                      {modulosCursoVideo.map((m) => (
                        <option key={m.id} value={m.id}>{m.titulo}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Zona de carga / reemplazo de video */}
              <div className="campo-grupo">
                <label className="campo-etiqueta">Archivo de video (se guarda en el servidor Python)</label>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg,.mov,.mkv"
                  style={{ display: 'none' }}
                  onChange={(e) => procesarArchivoVideo(e.target.files?.[0])}
                />
                <div
                  className={`dropzone-video ${arrastrando ? 'arrastrando' : ''}`}
                  onClick={() => inputFileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setArrastrando(true)
                  }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setArrastrando(false)
                    procesarArchivoVideo(e.dataTransfer.files?.[0])
                  }}
                >
                  <p className="dropzone-texto-principal">
                    {archivoVideo
                      ? `Nuevo archivo listo: ${archivoVideo.name} (${(archivoVideo.size / (1024 * 1024)).toFixed(1)} MB)`
                      : videoActualReferencia
                      ? `Video actual: ${videoActualReferencia} — Haz clic o arrastra otro para reemplazar`
                      : 'Arrastra un archivo de video (.mp4, .webm, .ogg) o haz clic para examinar'}
                  </p>
                </div>
                {erroresVideo.archivo && <span className="campo-mensaje-error">{erroresVideo.archivo}</span>}
              </div>

              {/* Vista previa SIEMPRE disponible cuando existe video nuevo o existente + Timeline arrastrable */}
              {videoPreviewSrc && (
                <div className="admin-video-preview-bloque">
                  <video
                    ref={previewVideoRef}
                    key={videoPreviewSrc}
                    src={videoPreviewSrc}
                    controls
                    preload="metadata"
                    className="admin-video-preview-player"
                    onLoadedMetadata={(e) => {
                      if (e.target.duration && !Number.isNaN(e.target.duration)) {
                        const seg = Math.round(e.target.duration)
                        if (seg > 0) setDuracionDetectada(seg)
                      }
                    }}
                  />

                  <TimelineCheckpoints
                    videoRef={previewVideoRef}
                    duracion={duracionDetectada}
                    checkpoints={checkpoints}
                    checkpointActivo={checkpointActivo}
                    alSeleccionarCheckpoint={(idx) => setCheckpointActivo(idx)}
                    alMoverCheckpoint={moverCheckpointASegundo}
                    alAgregarEnSegundo={agregarCheckpointEnSegundo}
                  />
                </div>
              )}

              {/* Constructor de checkpoints con los 5 tipos de preguntas */}
              <div className="seccion-checkpoints-builder">
                <div className="seccion-subcabecera">
                  <div>
                    <h3>Preguntas y checkpoints ({checkpoints.length})</h3>
                    <p className="texto-suave">
                      Soporta Opción única, Verdadero/Falso, Múltiple respuesta, Completación y Desarrollo (auto-evaluado).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="boton boton-claro"
                    onClick={() => agregarCheckpointEnSegundo(Math.min(20, Math.max(5, Math.floor(duracionDetectada / 2))))}
                  >
                    + Agregar pregunta
                  </button>
                </div>

                {checkpoints.length === 0 ? (
                  <p className="texto-suave mensaje-vacio-checkpoints">
                    No hay preguntas en esta lección. Haz clic en la barra del video o pulsa &quot;+ Agregar pregunta&quot;.
                  </p>
                ) : (
                  <div className="checkpoints-lista">
                    {checkpoints.map((cp, cpIdx) => {
                      const tiempoCp = Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0)
                      const fuera = duracionDetectada > 0 && tiempoCp >= duracionDetectada

                      return (
                        <div
                          key={cp.id || cpIdx}
                          className={`checkpoint-card ${checkpointActivo === cpIdx ? 'seleccionado' : ''}`}
                          onClick={() => setCheckpointActivo(cpIdx)}
                        >
                          <div className="checkpoint-card-header">
                            <span className="checkpoint-badge">Pregunta #{cpIdx + 1}</span>

                            <select
                              className="campo-input select-tipo-pregunta"
                              value={cp.tipo}
                              onChange={(e) => actualizarCheckpoint(cpIdx, 'tipo', e.target.value)}
                              aria-label="Tipo de pregunta"
                            >
                              {TIPOS_PREGUNTA.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                              ))}
                            </select>

                            <div className="tiempo-inputs-inline">
                              <input
                                type="number"
                                min="0"
                                className={`campo-input input-tiempo ${fuera ? 'con-error' : ''}`}
                                value={cp.minuto}
                                onChange={(e) => actualizarCheckpoint(cpIdx, 'minuto', Math.max(0, Number(e.target.value) || 0))}
                              />
                              <span>min</span>
                              <input
                                type="number"
                                min="0"
                                max="59"
                                className={`campo-input input-tiempo ${fuera ? 'con-error' : ''}`}
                                value={cp.segundo}
                                onChange={(e) => actualizarCheckpoint(cpIdx, 'segundo', Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                              />
                              <span>seg</span>
                            </div>

                            <button
                              type="button"
                              className="boton-eliminar-item"
                              onClick={(e) => {
                                e.stopPropagation()
                                eliminarCheckpoint(cpIdx)
                              }}
                            >
                              Eliminar
                            </button>
                          </div>

                          {fuera && (
                            <span className="campo-mensaje-error">
                              El tiempo ({formatoTiempo(tiempoCp)}) debe ser menor a la duración del video ({formatoTiempo(duracionDetectada)}).
                            </span>
                          )}

                          <div className="checkpoint-card-cuerpo">
                            <div className="campo-grupo">
                              <label className="campo-etiqueta">Enunciado de la pregunta *</label>
                              <input
                                type="text"
                                className="campo-input"
                                value={cp.pregunta}
                                onChange={(e) => actualizarCheckpoint(cpIdx, 'pregunta', e.target.value)}
                                placeholder="Escribe la pregunta que verá el estudiante…"
                              />
                            </div>

                            {cp.tipo === 'opcion_unica' && (
                              <div className="campo-grupo">
                                <label className="campo-etiqueta">Opciones (marca la correcta)</label>
                                <div className="opciones-respuestas-lista">
                                  {(cp.opciones || []).map((op, opIdx) => (
                                    <div key={opIdx} className="opcion-respuesta-fila">
                                      <input
                                        type="radio"
                                        name={`correcta-${cpIdx}`}
                                        checked={Number(cp.correcta) === opIdx}
                                        onChange={() => actualizarCheckpoint(cpIdx, 'correcta', opIdx)}
                                      />
                                      <input
                                        type="text"
                                        className="campo-input input-opcion-texto"
                                        value={op}
                                        onChange={(e) => actualizarOpcion(cpIdx, opIdx, e.target.value)}
                                      />
                                      {cp.opciones.length > 2 && (
                                        <button
                                          type="button"
                                          className="boton-quitar-opcion"
                                          onClick={() => eliminarOpcion(cpIdx, opIdx)}
                                        >
                                          Quitar
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {cp.opciones.length < 6 && (
                                  <button type="button" className="boton-texto-mas" onClick={() => agregarOpcion(cpIdx)}>
                                    + Agregar opción
                                  </button>
                                )}
                              </div>
                            )}

                            {cp.tipo === 'verdadero_falso' && (
                              <div className="campo-grupo">
                                <label className="campo-etiqueta">Respuesta correcta</label>
                                <div className="selector-modo-asignacion">
                                  <label className={`modo-opcion ${Number(cp.correcta) === 0 ? 'activo' : ''}`}>
                                    <input
                                      type="radio"
                                      name={`vf-${cpIdx}`}
                                      checked={Number(cp.correcta) === 0}
                                      onChange={() => actualizarCheckpoint(cpIdx, 'correcta', 0)}
                                    />
                                    <span>Verdadero</span>
                                  </label>
                                  <label className={`modo-opcion ${Number(cp.correcta) === 1 ? 'activo' : ''}`}>
                                    <input
                                      type="radio"
                                      name={`vf-${cpIdx}`}
                                      checked={Number(cp.correcta) === 1}
                                      onChange={() => actualizarCheckpoint(cpIdx, 'correcta', 1)}
                                    />
                                    <span>Falso</span>
                                  </label>
                                </div>
                              </div>
                            )}

                            {cp.tipo === 'multiple_respuesta' && (
                              <div className="campo-grupo">
                                <label className="campo-etiqueta">Opciones (marca TODAS las correctas)</label>
                                <div className="opciones-respuestas-lista">
                                  {(cp.opciones || []).map((op, opIdx) => (
                                    <div key={opIdx} className="opcion-respuesta-fila">
                                      <input
                                        type="checkbox"
                                        checked={(cp.correctas || []).includes(opIdx)}
                                        onChange={() => alternarCorrectaMultiple(cpIdx, opIdx)}
                                      />
                                      <input
                                        type="text"
                                        className="campo-input input-opcion-texto"
                                        value={op}
                                        onChange={(e) => actualizarOpcion(cpIdx, opIdx, e.target.value)}
                                      />
                                      {cp.opciones.length > 2 && (
                                        <button
                                          type="button"
                                          className="boton-quitar-opcion"
                                          onClick={() => eliminarOpcion(cpIdx, opIdx)}
                                        >
                                          Quitar
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {cp.opciones.length < 6 && (
                                  <button type="button" className="boton-texto-mas" onClick={() => agregarOpcion(cpIdx)}>
                                    + Agregar opción
                                  </button>
                                )}
                              </div>
                            )}

                            {cp.tipo === 'completacion' && (
                              <div className="admin-form-fila">
                                <div className="campo-grupo">
                                  <label className="campo-etiqueta">Respuestas aceptadas (separadas por coma) *</label>
                                  <input
                                    type="text"
                                    className="campo-input"
                                    value={cp.respuestasAceptadasTexto || ''}
                                    onChange={(e) => actualizarCheckpoint(cpIdx, 'respuestasAceptadasTexto', e.target.value)}
                                    placeholder="Ej: className, class name"
                                  />
                                </div>
                                <div className="campo-grupo">
                                  <label className="campo-etiqueta">Pista (opcional)</label>
                                  <input
                                    type="text"
                                    className="campo-input"
                                    value={cp.pista || ''}
                                    onChange={(e) => actualizarCheckpoint(cpIdx, 'pista', e.target.value)}
                                    placeholder="Ej: Empieza con class..."
                                  />
                                </div>
                              </div>
                            )}

                            {cp.tipo === 'desarrollo' && (
                              <div className="admin-form-fila">
                                <div className="campo-grupo">
                                  <label className="campo-etiqueta">Palabras clave para auto-evaluación (por coma)</label>
                                  <input
                                    type="text"
                                    className="campo-input"
                                    value={cp.palabrasClaveTexto || ''}
                                    onChange={(e) => actualizarCheckpoint(cpIdx, 'palabrasClaveTexto', e.target.value)}
                                    placeholder="Ej: props, estado, padre, cambia"
                                  />
                                </div>
                                <div className="campo-grupo">
                                  <label className="campo-etiqueta">Mínimo de palabras</label>
                                  <input
                                    type="number"
                                    min="3"
                                    className="campo-input"
                                    value={cp.minPalabras || 8}
                                    onChange={(e) => actualizarCheckpoint(cpIdx, 'minPalabras', Number(e.target.value) || 8)}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="campo-grupo">
                              <label className="campo-etiqueta">Explicación formativa al aprobar (opcional)</label>
                              <input
                                type="text"
                                className="campo-input"
                                value={cp.explicacion || ''}
                                onChange={(e) => actualizarCheckpoint(cpIdx, 'explicacion', e.target.value)}
                                placeholder="Retroalimentación que ve el estudiante al acertar…"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="botones">
                <button type="submit" className="boton" disabled={guardandoVideo}>
                  {guardandoVideo ? 'Guardando en servidor…' : 'Guardar video y checkpoints'}
                </button>
              </div>
            </form>
            )}
          </div>
        )}

        {/* ==================== PESTAÑA 3: SOLICITUDES Y ACCESOS ==================== */}
        {pestanaActiva === 'solicitudes' && (
          <div className="admin-grid">
            <section className="admin-tarjeta">
              <h2>Otorgar acceso directo a un estudiante</h2>
              <p className="texto-suave" style={{ marginBottom: '14px' }}>
                Habilita manualmente cualquier curso restringido a un estudiante registrado.
              </p>

              {mensajeAcceso && <div className="alerta-exito">{mensajeAcceso}</div>}

              <form onSubmit={handleOtorgarManual} className="admin-formulario">
                <div className="campo-grupo">
                  <label htmlFor="manual-est" className="campo-etiqueta">Estudiante</label>
                  <select
                    id="manual-est"
                    className="campo-input"
                    value={manualUsuarioId}
                    onChange={(e) => setManualUsuarioId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona un estudiante…</option>
                    {estudiantesLista.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} (@{u.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo-grupo">
                  <label htmlFor="manual-curso" className="campo-etiqueta">Curso restringido</label>
                  <select
                    id="manual-curso"
                    className="campo-input"
                    value={manualCursoId}
                    onChange={(e) => setManualCursoId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona un curso…</option>
                    {cursosRestringidos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo} (${(c.precio || 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="boton">Habilitar acceso</button>
              </form>
            </section>

            <section className="admin-tarjeta">
              <div className="seccion-subcabecera">
                <h2>Solicitudes y pagos simulados ({solicitudes.length})</h2>
                <button type="button" className="boton boton-claro" onClick={cargarSolicitudesYEstudiantes}>
                  Actualizar
                </button>
              </div>

              {cargandoSolicitudes ? (
                <p className="texto-suave">Cargando solicitudes…</p>
              ) : solicitudes.length === 0 ? (
                <p className="texto-suave">No hay solicitudes ni inscripciones registradas todavía.</p>
              ) : (
                <div className="admin-lista-cursos">
                  {solicitudes.map((s) => (
                    <div key={s.id} className="admin-curso-item">
                      <div>
                        <div className="admin-curso-titulo-row">
                          <strong>{s.estudianteNombre}</strong>
                          <span className="texto-suave">@{s.estudianteUsername}</span>
                          <span className={`etiqueta-acceso ${s.estado === 'aprobado' ? 'aprobado' : s.estado === 'pendiente' ? 'pendiente' : 'restringido'}`}>
                            {s.estado}
                          </span>
                        </div>
                        <p><strong>Curso:</strong> {s.cursoTitulo}</p>
                        <p className="texto-suave">
                          Método: {s.metodo}
                          {s.referenciaPago ? ` · Ref: ${s.referenciaPago} ($${Number(s.montoPagado || 0).toFixed(2)})` : ''}
                        </p>
                        {s.mensajeSolicitud && (
                          <p className="texto-suave">&ldquo;{s.mensajeSolicitud}&rdquo;</p>
                        )}
                      </div>

                      <div className="admin-curso-acciones">
                        {s.estado !== 'aprobado' && (
                          <button
                            type="button"
                            className="boton"
                            onClick={() => handleResolverSolicitud(s.id, 'aprobado')}
                          >
                            Aprobar
                          </button>
                        )}
                        {s.estado !== 'rechazado' && (
                          <button
                            type="button"
                            className="boton-eliminar-item"
                            onClick={() => handleResolverSolicitud(s.id, 'rechazado')}
                          >
                            Revocar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== PESTAÑA 4: USUARIOS Y ROLES (SOLO ADMIN GENERAL) ==================== */}
        {pestanaActiva === 'usuarios' && esAdminGeneral && (
          <div className="admin-grid">
            <section className="admin-tarjeta">
              <h2>Crear cuenta de Profesor o Administrador</h2>
              <p className="texto-suave" style={{ marginBottom: '14px' }}>
                Los estudiantes se registran por su cuenta en el login; las cuentas con permisos para subir videos y gestionar cursos se crean únicamente aquí.
              </p>

              {mensajeUsuario && <div className="alerta-exito">{mensajeUsuario}</div>}
              {errorUsuario && <div className="alerta-error">{errorUsuario}</div>}

              <form onSubmit={handleCrearUsuario} className="admin-formulario">
                <div className="campo-grupo">
                  <label htmlFor="u-nombre" className="campo-etiqueta">Nombre completo *</label>
                  <input
                    id="u-nombre"
                    type="text"
                    className="campo-input"
                    value={nuevoUserNombre}
                    onChange={(e) => setNuevoUserNombre(e.target.value)}
                    placeholder="Ej: Prof. Laura Medina"
                    required
                  />
                </div>

                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="u-username" className="campo-etiqueta">Usuario *</label>
                    <input
                      id="u-username"
                      type="text"
                      className="campo-input"
                      value={nuevoUserUsername}
                      onChange={(e) => setNuevoUserUsername(e.target.value)}
                      placeholder="Ej: prof_laura"
                      required
                    />
                  </div>
                  <div className="campo-grupo">
                    <label htmlFor="u-rol" className="campo-etiqueta">Rol *</label>
                    <select
                      id="u-rol"
                      className="campo-input"
                      value={nuevoUserRol}
                      onChange={(e) => setNuevoUserRol(e.target.value)}
                    >
                      <option value="profesor">Profesor (gestiona cursos, videos y accesos)</option>
                      <option value="admin_general">Administrador general (control total)</option>
                      <option value="estudiante">Estudiante</option>
                    </select>
                  </div>
                </div>

                <div className="admin-form-fila">
                  <div className="campo-grupo">
                    <label htmlFor="u-email" className="campo-etiqueta">Correo (opcional)</label>
                    <input
                      id="u-email"
                      type="email"
                      className="campo-input"
                      value={nuevoUserEmail}
                      onChange={(e) => setNuevoUserEmail(e.target.value)}
                      placeholder="laura@anden.urbe.edu"
                    />
                  </div>
                  <div className="campo-grupo">
                    <label htmlFor="u-pass" className="campo-etiqueta">Contraseña inicial *</label>
                    <input
                      id="u-pass"
                      type="password"
                      className="campo-input"
                      value={nuevoUserPassword}
                      onChange={(e) => setNuevoUserPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="boton">Crear cuenta</button>
              </form>
            </section>

            <section className="admin-tarjeta">
              <h2>Usuarios registrados ({usuariosLista.length})</h2>
              {cargandoUsuarios ? (
                <p className="texto-suave">Cargando usuarios…</p>
              ) : (
                <div className="admin-lista-cursos">
                  {usuariosLista.map((u) => (
                    <div key={u.id} className="admin-curso-item">
                      <div>
                        <div className="admin-curso-titulo-row">
                          <strong>{u.nombre}</strong>
                          <span className="texto-suave">@{u.username}</span>
                          <span className={`etiqueta-rol rol-${u.rol}`}>{u.rol.replace('_', ' ')}</span>
                          {!u.activo && <span className="etiqueta-acceso restringido">Inactivo</span>}
                        </div>
                        <p className="texto-suave">{u.email || 'Sin correo'}</p>
                      </div>

                      {u.id !== usuarioActual?.id && (
                        <button
                          type="button"
                          className="boton boton-claro"
                          onClick={() => handleCambiarEstadoUsuario(u)}
                        >
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default Admin
