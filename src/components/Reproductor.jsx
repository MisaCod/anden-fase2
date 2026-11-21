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

// Reproductor propio sobre un <video> real.
// Props: curso, leccion y siguiente (la lección que sigue, o undefined si es la última)
function Reproductor({ curso, leccion, siguiente }) {
  const { progreso, guardarAvance, responder, completarLeccion } = useProgreso()

  // useRef guarda el <video> real, como document.getElementById en JavaScript puro
  const videoRef = useRef(null)
  const reproductorRef = useRef(null)

  const [videoSrc, setVideoSrc] = useState(leccion.video)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [tiempo, setTiempo] = useState(0)
  const [duracion, setDuracion] = useState(leccion.duracion)
  const [preguntaActiva, setPreguntaActiva] = useState(null)
  const [terminada, setTerminada] = useState(null) // null, 'nueva' o 'repaso'
  const [reanudado, setReanudado] = useState(0) // segundo desde el que se continuó
  const [pantallaCompleta, setPantallaCompleta] = useState(false)

  // Sincronizar estado con eventos del navegador de pantalla completa
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

  // Atajo de teclado: tecla 'f' para alternar pantalla completa
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
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {})
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen()
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen()
      }
    }
  }

  // Resuelve la URL del video (soporta rutas estáticas y blobs de IndexedDB)
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
  const limite = limiteDeAvance(leccion, progreso)

  // Botón ▶ / ❚❚: el propio video sabe si está pausado
  function alternar() {
    const video = videoRef.current
    if (preguntaActiva) return
    // play() devuelve una promesa que falla si una pausa la interrumpe; el error no importa
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  // El video ya sabe cuánto dura: si la lección no está completada, se sigue desde lo visto
  function alCargar() {
    const video = videoRef.current
    setDuracion(video.duration)
    if (!avance.completada && avance.maximo > 0) {
      video.currentTime = avance.maximo
      setTiempo(avance.maximo)
      setReanudado(avance.maximo)
    }
  }

  // Llega unas 4 veces por segundo mientras el video avanza
  function alAvanzar() {
    const video = videoRef.current
    const ahora = video.currentTime
    setTiempo(ahora)

    // ¿Hay una pregunta sin responder en este punto? El video se detiene en su segundo exacto
    const pendiente = preguntaPendiente(leccion, progreso, ahora)
    if (pendiente) {
      video.pause()
      // Solo si se pasó: cambiar currentTime vuelve a disparar onTimeUpdate y, sin este if, se repetiría sin parar
      if (ahora > pendiente.segundo) video.currentTime = pendiente.segundo
      setTiempo(pendiente.segundo)
      setPreguntaActiva(pendiente)
      return
    }

    // Solo se guarda cuando se ve un segundo nuevo, así el progreso cambia como mucho una vez por segundo
    const segundo = Math.floor(ahora)
    if (!avance.completada && segundo > avance.maximo) {
      guardarAvance(curso.id, leccion.id, segundo)
    }
  }

  // Mover la línea de tiempo: hacia atrás siempre, hacia adelante solo hasta lo ya visto
  function alMover(evento) {
    const video = videoRef.current
    const destino = Math.min(Number(evento.target.value), limite)
    video.currentTime = destino
    setTiempo(destino)
  }

  // Regla de seguridad para cualquier otro camino (menú del navegador, consola):
  // si el video salta más allá de lo visto, vuelve al límite.
  // El +1 es por las preguntas: al parar en la de 0:20 ese segundo aún no se guardó (maximo 19),
  // y sin el +1 esta regla devolvería el video a 0:19
  function alBuscar() {
    const video = videoRef.current
    if (video.currentTime > limite + 1) video.currentTime = limite
  }

  // Con una pregunta abierta nadie puede reanudar el video, ni siquiera con el menú del navegador
  function alReproducir() {
    if (preguntaActiva) {
      videoRef.current.pause()
      return
    }
    setTerminada(null)
    setReproduciendo(true)
  }

  function alTerminar() {
    // Por si quedó alguna pregunta sin responder, se muestra antes de completar
    const pendiente = preguntaPendiente(leccion, progreso, duracion)
    if (pendiente) {
      setPreguntaActiva(pendiente)
      return
    }
    setTerminada(avance.completada ? 'repaso' : 'nueva')
    completarLeccion(curso, leccion)
  }

  // Después de acertar: se cierra la pregunta y el video sigue
  function continuar() {
    setPreguntaActiva(null)
    videoRef.current.play().catch(() => {})
  }

  function verDeNuevo() {
    const video = videoRef.current
    setTerminada(null)
    video.currentTime = 0
    video.play().catch(() => {})
  }

  const esUltima = !siguiente

  return (
    <>
      <div
        ref={reproductorRef}
        className={`reproductor ${pantallaCompleta ? 'en-pantalla-completa' : ''}`}
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
            <button className="boton-play" onClick={alternar} aria-label="Reproducir">
              ▶
            </button>
          )}

          {preguntaActiva && (
            <div className="capa capa-pregunta">
              <Cuestionario
                key={preguntaActiva.id}
                pregunta={preguntaActiva}
                alResponder={(opcion, intento) => responder(preguntaActiva, opcion, intento)}
                alContinuar={continuar}
              />
            </div>
          )}

          {terminada && (
            <div className="capa capa-final" role="alert">
              {/* role="alert": el lector de pantalla lo lee en cuanto aparece */}
              <p className="capa-titulo">
                {terminada === 'repaso' && 'Repaso terminado'}
                {terminada === 'nueva' && (esUltima ? '¡Terminaste el curso!' : 'Lección completada')}
              </p>
              {terminada === 'nueva' && (
                <p>
                  +{XP_LECCION} XP{esUltima ? ' y +' + XP_CURSO + ' XP por terminar el curso' : ''}
                </p>
              )}
              <div className="botones">
                {esUltima ? (
                  <Link to="/cursos" className="boton">Volver a cursos</Link>
                ) : (
                  <Link to={'/aula/' + curso.id + '/' + siguiente.id} className="boton">
                    Siguiente lección
                  </Link>
                )}
                <button className="boton boton-claro" onClick={verDeNuevo}>Ver de nuevo</button>
              </div>
            </div>
          )}
        </div>

        <div className="controles">
          <button
            className="control"
            onClick={alternar}
            disabled={Boolean(preguntaActiva)}
            aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
          >
            {reproduciendo ? '❚❚' : '▶'}
          </button>

          <div className="linea-tiempo">
            {/* Tramo claro: hasta dónde se puede saltar. Tramo menta: lo que se lleva */}
            <div className="linea-tiempo-limite" style={{ width: (limite / duracion) * 100 + '%' }}></div>
            <div className="linea-tiempo-visto" style={{ width: (tiempo / duracion) * 100 + '%' }}></div>

            {leccion.cuestionarios.map((c) => (
              <span
                key={c.id}
                className={preguntaRespondida(c, leccion, progreso) ? 'marca respondida' : 'marca'}
                style={{ left: Math.min(100, Math.max(0, (c.segundo / duracion) * 100)) + '%' }}
              ></span>
            ))}

            {/* El range invisible encima del dibujo es el que se arrastra y se usa con el teclado */}
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <p className="leyenda">
        <span className="marca-leyenda"></span>
        {/* En repaso (lección completada) no hay preguntas pendientes ni límite para adelantar */}
        {avance.completada
          ? 'Ya completaste esta lección: el video no se detiene en las preguntas y puedes adelantar libremente.'
          : 'El video se detiene en cada punto para hacerte una pregunta. Solo puedes adelantar hasta donde ya viste.'}
        {reanudado > 0 && !avance.completada ? ' Continúas desde ' + formatoTiempo(reanudado) + '.' : ''}
      </p>
    </>
  )
}

export default Reproductor
