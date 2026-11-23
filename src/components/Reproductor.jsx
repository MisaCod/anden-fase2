import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Cuestionario from './Cuestionario.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { obtenerVideoUrl } from '../logica/almacenamientoVideos.js'
import { formatoTiempo } from '../logica/formato.js'
import { XP_CURSO, XP_LECCION } from '../logica/gamificacion.js'
import {
  avanceDe,
  limiteDeAvance,
  preguntaPendiente,
  preguntaRespondida,
} from '../logica/progreso.js'

function Reproductor({ curso, leccion, siguiente, modoRepaso = false }) {
  const { progreso, guardarAvance, responder, completarLeccion, estadisticasPorCurso, certificados } =
    useProgreso()

  const videoRef = useRef(null)
  const reproductorRef = useRef(null)
  const completandoRef = useRef(false)

  const [videoSrc, setVideoSrc] = useState(leccion.video)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(leccion.duracion)
  const [preguntaActiva, setPreguntaActiva] = useState(null)
  const [respondidasEnRepaso, setRespondidasEnRepaso] = useState([])
  const [terminada, setTerminada] = useState(null) // null, 'nueva' o 'repaso'
  const [guardandoFinal, setGuardandoFinal] = useState(false)
  const [reanudado, setReanudado] = useState(0)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)

  useEffect(() => {
    function alCambiarPantallaCompleta() {
      const estaEnFs = Boolean(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
      )
      setPantallaCompleta(estaEnFs)
    }

    document.addEventListener('fullscreenchange', alCambiarPantallaCompleta)
    document.addEventListener('webkitfullscreenchange', alCambiarPantallaCompleta)
    document.addEventListener('mozfullscreenchange', alCambiarPantallaCompleta)
    document.addEventListener('MSFullscreenChange', alCambiarPantallaCompleta)

    return () => {
      document.removeEventListener('fullscreenchange', alCambiarPantallaCompleta)
      document.removeEventListener('webkitfullscreenchange', alCambiarPantallaCompleta)
      document.removeEventListener('mozfullscreenchange', alCambiarPantallaCompleta)
      document.removeEventListener('MSFullscreenChange', alCambiarPantallaCompleta)
    }
  }, [])

  useEffect(() => {
    function manejarTeclas(e) {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        alternarPantallaCompleta()
      }
    }

    window.addEventListener('keydown', manejarTeclas)
    return () => window.removeEventListener('keydown', manejarTeclas)
  }, [])

  function alternarPantallaCompleta() {
    const el = reproductorRef.current
    if (!el) return

    const estaEnFs = Boolean(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
    )

    if (!estaEnFs) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      else if (el.msRequestFullscreen) el.msRequestFullscreen()
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
      else if (document.msExitFullscreen) document.msExitFullscreen()
    }
  }

  useEffect(() => {
    let urlBlob = null
    let activo = true

    obtenerVideoUrl(leccion.video).then((url) => {
      if (activo && url) {
        setVideoSrc(url)
        if (url.startsWith('blob:')) urlBlob = url
      }
    })

    return () => {
      activo = false
      if (urlBlob) URL.revokeObjectURL(urlBlob)
    }
  }, [leccion.video])

  const avance = avanceDe(progreso, leccion.id)
  // Usar la duración real del video cargado para no truncar el límite si el curso traía una duración vieja
  const limite = avance.completada
    ? Math.max(Number(duracion) || 0, Number(leccion.duracion) || 0)
    : limiteDeAvance(leccion, progreso)

  function buscarPreguntaPendiente(ahora) {
    if (modoRepaso) {
      return (leccion.cuestionarios || []).find(
        (p) => p.segundo <= ahora && !respondidasEnRepaso.includes(p.id)
      )
    }
    return preguntaPendiente(leccion, progreso, ahora)
  }

  function alternar() {
    const video = videoRef.current
    if (preguntaActiva) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function alCargar() {
    const video = videoRef.current
    const durReal = video.duration && !Number.isNaN(video.duration) ? video.duration : leccion.duracion
    setDuracion(durReal)
    if (!modoRepaso && !avance.completada && avance.maximo > 0) {
      const punto = Math.min(avance.maximo, Math.max(0, durReal - 1))
      video.currentTime = punto
      setTiempo(punto)
      setReanudado(punto)
    }
  }

  function alAvanzar() {
    const video = videoRef.current
    if (!video || completandoRef.current || video.ended) return
    const ahora = video.currentTime
    setTiempo(ahora)

    const pendiente = buscarPreguntaPendiente(ahora)
    if (pendiente) {
      video.pause()
      if (ahora > pendiente.segundo) video.currentTime = pendiente.segundo
      setTiempo(pendiente.segundo)
      setPreguntaActiva(pendiente)
      return
    }

    const segundo = Math.floor(ahora)
    const durReal = Math.round(video.duration || duracion || leccion.duracion)
    // No disparar /avance en el último segundo (evita carrera con onEnded -> /completar-leccion)
    if (!avance.completada && segundo > avance.maximo && segundo < Math.max(1, durReal)) {
      guardarAvance(curso.id, leccion.id, segundo, durReal)
    }
  }

  function alMover(evento) {
    const video = videoRef.current
    const destino = Math.min(Number(evento.target.value), limite)
    video.currentTime = destino
    setTiempo(destino)
  }

  function alBuscar() {
    const video = videoRef.current
    if (video.currentTime > limite + 1) video.currentTime = limite
  }

  function alReproducir() {
    if (preguntaActiva) {
      videoRef.current.pause()
      return
    }
    completandoRef.current = false
    setTerminada(null)
    setReproduciendo(true)
  }

  async function alTerminar() {
    const video = videoRef.current
    const durReal = Math.round((video && video.duration) || duracion || leccion.duracion)
    const pendiente = buscarPreguntaPendiente(durReal)
    if (pendiente) {
      setPreguntaActiva(pendiente)
      return
    }

    completandoRef.current = true
    const eraRepaso = avance.completada
    setTerminada(eraRepaso ? 'repaso' : 'nueva')

    if (!eraRepaso) {
      setGuardandoFinal(true)
      await completarLeccion(curso, leccion, durReal)
      setGuardandoFinal(false)
    }
  }

  async function manejarRespuesta(valor, intento, esRepaso) {
    const res = await responder(preguntaActiva, valor, intento, esRepaso)
    if (res?.correcta && esRepaso) {
      setRespondidasEnRepaso((prev) => [...prev, preguntaActiva.id])
    }
    return res
  }

  function continuar() {
    setPreguntaActiva(null)
    videoRef.current.play().catch(() => {})
  }

  function verDeNuevo() {
    const video = videoRef.current
    completandoRef.current = false
    setTerminada(null)
    setRespondidasEnRepaso([])
    video.currentTime = 0
    video.play().catch(() => {})
  }

  const esUltima = !siguiente
  const statsCurso = estadisticasPorCurso[String(curso.id)]
  const certCurso = certificados.find((c) => c.cursoId === curso.id)

  return (
    <>
      <div
        ref={reproductorRef}
        className={`reproductor reproductor-tematico ${pantallaCompleta ? 'en-pantalla-completa' : ''}`}
      >
        <div className="pantalla">
          <video
            ref={videoRef}
            src={videoSrc}
            preload="metadata"
            onClick={alternar}
            onDoubleClick={alternarPantallaCompleta}
            onLoadedMetadata={alCargar}
            onTimeUpdate={alAvanzar}
            onPlay={alReproducir}
            onPause={() => setReproduciendo(false)}
            onSeeking={alBuscar}
            onEnded={alTerminar}
          ></video>

          {!reproduciendo && !preguntaActiva && !terminada && (
            <button type="button" className="boton-play" onClick={alternar} aria-label="Reproducir">
              ▶
            </button>
          )}

          {preguntaActiva && (
            <div className="capa capa-pregunta">
              <Cuestionario
                key={preguntaActiva.id}
                pregunta={preguntaActiva}
                alResponder={manejarRespuesta}
                alContinuar={continuar}
                modoRepaso={modoRepaso}
              />
            </div>
          )}

          {terminada && (
            <div className="capa capa-final" role="alert">
              <p className="capa-titulo">
                {terminada === 'repaso' && 'Repaso terminado'}
                {terminada === 'nueva' && (esUltima ? '¡Terminaste el curso!' : 'Lección completada')}
              </p>
              {terminada === 'nueva' && (
                <p>
                  +{XP_LECCION} XP{esUltima ? ` y +${XP_CURSO} XP por terminar el curso` : ''}
                </p>
              )}
              {esUltima && statsCurso && (
                <p className="texto-suave">
                  Aciertos del curso: <strong>{statsCurso.porcentajeAciertos}%</strong> (mínimo para certificado: {statsCurso.umbralCertificado}%)
                </p>
              )}
              <div className="botones">
                {guardandoFinal ? (
                  <button type="button" className="boton" disabled>
                    Guardando progreso…
                  </button>
                ) : esUltima && certCurso ? (
                  <Link to={'/certificado/' + curso.id} className="boton">
                    Ver mi certificado
                  </Link>
                ) : esUltima ? (
                  <Link to="/cursos" className="boton">Volver a cursos</Link>
                ) : (
                  <Link to={'/aula/' + curso.id + '/' + siguiente.id} className="boton">
                    Siguiente lección
                  </Link>
                )}
                <button
                  type="button"
                  className="boton boton-claro"
                  onClick={verDeNuevo}
                  disabled={guardandoFinal}
                >
                  Ver de nuevo
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="controles">
          <button
            type="button"
            className="control"
            onClick={alternar}
            disabled={Boolean(preguntaActiva)}
            aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
          >
            {reproduciendo ? '❚❚' : '▶'}
          </button>

          <div className="linea-tiempo">
            <div className="linea-tiempo-limite" style={{ width: Math.min(100, (limite / (duracion || 1)) * 100) + '%' }}></div>
            <div className="linea-tiempo-visto" style={{ width: Math.min(100, (tiempo / (duracion || 1)) * 100) + '%' }}></div>

            {(leccion.cuestionarios || []).map((c) => {
              const respondida = modoRepaso
                ? respondidasEnRepaso.includes(c.id)
                : preguntaRespondida(c, leccion, progreso)
              return (
                <span
                  key={c.id}
                  className={respondida ? 'marca respondida' : 'marca'}
                  style={{ left: Math.min(100, Math.max(0, (c.segundo / (duracion || 1)) * 100)) + '%' }}
                  title={`${formatoTiempo(c.segundo)} · ${c.tipo || 'opcion_unica'}`}
                ></span>
              )
            })}

            <input
              type="range"
              min="0"
              max={duracion}
              step="1"
              value={tiempo}
              onChange={alMover}
              disabled={Boolean(preguntaActiva)}
              aria-label="Línea de tiempo"
              aria-valuetext={formatoTiempo(tiempo) + ' de ' + formatoTiempo(duracion)}
            />
          </div>

          <span className="tiempo">
            {formatoTiempo(tiempo)} / {formatoTiempo(duracion)}
          </span>

          <button
            type="button"
            className="control control-fullscreen"
            onClick={alternarPantallaCompleta}
            aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            title={pantallaCompleta ? 'Salir de pantalla completa (f)' : 'Pantalla completa (f)'}
          >
            {pantallaCompleta ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <p className="leyenda">
        <span className="marca-leyenda"></span>
        {modoRepaso
          ? 'Modo repaso con preguntas activo: responder al primer intento mejora tu porcentaje de aciertos del curso.'
          : avance.completada
          ? 'Ya completaste esta lección: el video no se detiene en las preguntas y puedes adelantar libremente.'
          : 'El video se detiene en cada punto para hacerte una pregunta. Solo puedes adelantar hasta donde ya viste.'}
        {reanudado > 0 && !avance.completada && !modoRepaso
          ? ' Continúas desde ' + formatoTiempo(reanudado) + '.'
          : ''}
      </p>
    </>
  )
}

export default Reproductor
