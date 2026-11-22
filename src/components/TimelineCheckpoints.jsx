import { useEffect, useRef, useState } from 'react'
import { formatoTiempo } from '../logica/formato.js'

/**
 * Barra de progreso interactiva para colocar y mover preguntas directamente sobre el video.
 * - Clic en la barra: mueve el video a ese segundo (y permite añadir o mover una pregunta ahí).
 * - Arrastrar cualquier marcador (#1, #2...): cambia el segundo de la pregunta en vivo y actualiza el frame del video.
 */
function TimelineCheckpoints({
  videoRef,
  duracion,
  checkpoints,
  checkpointActivo,
  alSeleccionarCheckpoint,
  alMoverCheckpoint,
  alAgregarEnSegundo,
}) {
  const barraRef = useRef(null)
  const [tiempoVideo, setTiempoVideo] = useState(0)
  const [arrastrandoIdx, setArrastrandoIdx] = useState(null)

  const duracionSegura = Math.max(1, Number(duracion) || 60)

  // Sincronizar con el <video> de vista previa
  useEffect(() => {
    const video = videoRef?.current
    if (!video) return

    function alActualizar() {
      setTiempoVideo(video.currentTime || 0)
    }

    video.addEventListener('timeupdate', alActualizar)
    video.addEventListener('seeked', alActualizar)
    video.addEventListener('loadedmetadata', alActualizar)

    return () => {
      video.removeEventListener('timeupdate', alActualizar)
      video.removeEventListener('seeked', alActualizar)
      video.removeEventListener('loadedmetadata', alActualizar)
    }
  }, [videoRef, duracion])

  function calcularSegundoDesdeClienteX(clientX) {
    const barra = barraRef.current
    if (!barra) return 0
    const rect = barra.getBoundingClientRect()
    const proporcion = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
    let seg = Math.round(proporcion * duracionSegura)
    if (seg >= duracionSegura) seg = Math.max(1, duracionSegura - 1)
    return seg
  }

  function moverVideoA(seg) {
    setTiempoVideo(seg)
    if (videoRef?.current && !Number.isNaN(seg)) {
      try {
        videoRef.current.currentTime = seg
      } catch {
        // Ignorar si el video aún no cargó metadatos
      }
    }
  }

  useEffect(() => {
    if (arrastrandoIdx === null) return

    function alMoverPuntero(e) {
      const seg = calcularSegundoDesdeClienteX(e.clientX)
      alMoverCheckpoint(arrastrandoIdx, seg)
      moverVideoA(seg)
    }

    function alSoltarPuntero() {
      setArrastrandoIdx(null)
    }

    window.addEventListener('pointermove', alMoverPuntero)
    window.addEventListener('pointerup', alSoltarPuntero)
    return () => {
      window.removeEventListener('pointermove', alMoverPuntero)
      window.removeEventListener('pointerup', alSoltarPuntero)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastrandoIdx, duracionSegura])

  function handleClickBarra(e) {
    if (arrastrandoIdx !== null) return
    const seg = calcularSegundoDesdeClienteX(e.clientX)
    moverVideoA(seg)
  }

  const segundoActualRedondeado = Math.min(
    Math.max(0, Math.round(tiempoVideo)),
    Math.max(1, duracionSegura - 1)
  )

  return (
    <div className="timeline-editor">
      <div className="timeline-editor-cabecera">
        <div>
          <strong>Línea de tiempo interactiva de preguntas</strong>
          <p className="texto-suave">
            Haz clic en la barra para ubicarte o <strong>arrastra los marcadores</strong> para fijar el segundo exacto de cada pregunta.
          </p>
        </div>
        <div className="timeline-editor-acciones">
          <span className="timeline-tiempo-actual">
            Posición: {formatoTiempo(tiempoVideo)} / {formatoTiempo(duracionSegura)}
          </span>
          <button
            type="button"
            className="boton-tiempo-actual"
            onClick={() => alAgregarEnSegundo(segundoActualRedondeado)}
          >
            + Poner pregunta en {formatoTiempo(segundoActualRedondeado)}
          </button>
          {checkpointActivo !== null && checkpoints[checkpointActivo] && (
            <button
              type="button"
              className="boton-tiempo-actual secundario"
              onClick={() => alMoverCheckpoint(checkpointActivo, segundoActualRedondeado)}
            >
              Mover #{checkpointActivo + 1} aquí
            </button>
          )}
        </div>
      </div>

      <div
        ref={barraRef}
        className="timeline-pista"
        onClick={handleClickBarra}
        role="slider"
        tabIndex={0}
        aria-label="Barra de progreso para ubicar preguntas"
        aria-valuemin={0}
        aria-valuemax={duracionSegura}
        aria-valuenow={Math.round(tiempoVideo)}
      >
        <div
          className="timeline-progreso"
          style={{ width: `${Math.min(100, (tiempoVideo / duracionSegura) * 100)}%` }}
        />

        <div
          className="timeline-aguja"
          style={{ left: `${Math.min(100, (tiempoVideo / duracionSegura) * 100)}%` }}
          aria-hidden="true"
        />

        {checkpoints.map((cp, idx) => {
          const segCp = Number(cp.minuto || 0) * 60 + Number(cp.segundo || 0)
          const pct = Math.min(100, Math.max(0, (segCp / duracionSegura) * 100))
          const esActivo = checkpointActivo === idx || arrastrandoIdx === idx
          const fuera = segCp >= duracionSegura

          return (
            <button
              key={cp.id || idx}
              type="button"
              className={`timeline-marcador ${esActivo ? 'activo' : ''} ${fuera ? 'fuera' : ''}`}
              style={{ left: `${pct}%` }}
              title={`Pregunta #${idx + 1} en ${formatoTiempo(segCp)} — Arrastra para mover`}
              onClick={(e) => {
                e.stopPropagation()
                alSeleccionarCheckpoint(idx)
                moverVideoA(segCp)
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                alSeleccionarCheckpoint(idx)
                setArrastrandoIdx(idx)
              }}
            >
              <span>#{idx + 1}</span>
            </button>
          )
        })}
      </div>

      <div className="timeline-regla">
        <span>0:00</span>
        <span>{formatoTiempo(Math.round(duracionSegura * 0.25))}</span>
        <span>{formatoTiempo(Math.round(duracionSegura * 0.5))}</span>
        <span>{formatoTiempo(Math.round(duracionSegura * 0.75))}</span>
        <span>{formatoTiempo(duracionSegura)}</span>
      </div>
    </div>
  )
}

export default TimelineCheckpoints
