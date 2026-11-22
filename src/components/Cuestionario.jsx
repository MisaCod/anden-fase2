import { useState } from 'react'
import { formatoTiempo } from '../logica/formato.js'
import { xpPorRespuesta } from '../logica/gamificacion.js'

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

const ETIQUETAS_TIPO = {
  opcion_unica: 'Opción única',
  verdadero_falso: 'Verdadero / Falso',
  multiple_respuesta: 'Múltiple respuesta',
  completacion: 'Completación',
  desarrollo: 'Desarrollo (auto-evaluado)',
}

function contarPalabras(texto) {
  return (texto || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function Cuestionario({ pregunta, alResponder, alContinuar, modoRepaso = false }) {
  const tipo = pregunta.tipo || 'opcion_unica'
  const opciones =
    tipo === 'verdadero_falso'
      ? pregunta.opciones && pregunta.opciones.length === 2
        ? pregunta.opciones
        : ['Verdadero', 'Falso']
      : pregunta.opciones || []

  const [seleccion, setSeleccion] = useState(null) // opcion_unica / verdadero_falso
  const [seleccionMultiple, setSeleccionMultiple] = useState([]) // multiple_respuesta
  const [textoRespuesta, setTextoRespuesta] = useState('') // completacion / desarrollo
  const [intento, setIntento] = useState(1)
  const [fallidas, setFallidas] = useState([])
  const [acertada, setAcertada] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [detalles, setDetalles] = useState(null)

  function alternarMultiple(idx) {
    if (acertada || enviando) return
    setSeleccionMultiple((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    )
    setMensaje('')
  }

  const tieneEntradaValida = (() => {
    if (tipo === 'opcion_unica' || tipo === 'verdadero_falso') return seleccion !== null
    if (tipo === 'multiple_respuesta') return seleccionMultiple.length > 0
    return textoRespuesta.trim().length > 0
  })()

  async function responder() {
    if (acertada || enviando || !tieneEntradaValida) return

    let valor
    if (tipo === 'opcion_unica' || tipo === 'verdadero_falso') valor = seleccion
    else if (tipo === 'multiple_respuesta') valor = seleccionMultiple
    else valor = textoRespuesta.trim()

    setEnviando(true)
    try {
      const res = await alResponder(valor, intento, modoRepaso)
      setDetalles(res?.detalles || null)

      if (res?.correcta) {
        setAcertada(true)
        setMensaje(res.mensaje || `¡Correcto! ${pregunta.explicacion || ''}`.trim())
      } else {
        setMensaje(res?.mensaje || 'No es correcta. Intenta de nuevo.')
        if (tipo === 'opcion_unica' || tipo === 'verdadero_falso') {
          setFallidas((prev) => [...prev, seleccion])
          setSeleccion(null)
        }
        setIntento((prev) => prev + 1)
      }
    } catch (err) {
      setMensaje(err?.message || 'Error al evaluar la respuesta.')
    } finally {
      setEnviando(false)
    }
  }

  const idTitulo = 'pregunta-' + pregunta.id
  const palabrasActuales = contarPalabras(textoRespuesta)
  const minPalabras = Number(pregunta.minPalabras || 8)

  return (
    <div className="cuestionario">
      <div className="cuestionario-meta">
        <p className="texto-suave">Pregunta a los {formatoTiempo(pregunta.segundo)}</p>
        <span className="etiqueta-tipo-pregunta">
          {ETIQUETAS_TIPO[tipo] || 'Pregunta'}
          {modoRepaso ? ' · Repaso' : ''}
        </span>
      </div>

      <h2 id={idTitulo}>{pregunta.pregunta}</h2>

      {(tipo === 'opcion_unica' || tipo === 'verdadero_falso') && (
        <div
          className={`opciones ${tipo === 'verdadero_falso' ? 'opciones-vf' : ''}`}
          role="group"
          aria-labelledby={idTitulo}
        >
          {opciones.map((opcion, i) => {
            let clase = 'opcion'
            if (fallidas.includes(i)) clase += ' incorrecta'
            if (acertada && i === seleccion) clase += ' correcta'
            if (!acertada && i === seleccion) clase += ' seleccionada'

            return (
              <button
                key={`${i}-${opcion}`}
                type="button"
                className={clase}
                disabled={acertada || fallidas.includes(i) || enviando}
                aria-pressed={i === seleccion}
                onClick={() => {
                  setSeleccion(i)
                  setMensaje('')
                }}
                autoFocus={i === 0}
              >
                <span className="opcion-letra">
                  {tipo === 'verdadero_falso' ? (i === 0 ? 'V' : 'F') : LETRAS[i] || i + 1}
                </span>
                {opcion}
              </button>
            )
          })}
        </div>
      )}

      {tipo === 'multiple_respuesta' && (
        <div className="opciones" role="group" aria-labelledby={idTitulo}>
          <p className="texto-suave instruccion-tipo">Selecciona todas las opciones que sean correctas:</p>
          {opciones.map((opcion, i) => {
            const marcada = seleccionMultiple.includes(i)
            let clase = 'opcion opcion-multiple'
            if (acertada && marcada) clase += ' correcta'
            else if (!acertada && marcada) clase += ' seleccionada'

            return (
              <button
                key={`${i}-${opcion}`}
                type="button"
                className={clase}
                disabled={acertada || enviando}
                aria-pressed={marcada}
                onClick={() => alternarMultiple(i)}
                autoFocus={i === 0}
              >
                <span className="opcion-check" aria-hidden="true">
                  {marcada ? '✓' : ''}
                </span>
                {opcion}
              </button>
            )
          })}
        </div>
      )}

      {tipo === 'completacion' && (
        <div className="cuestionario-entrada-texto">
          {pregunta.pista && (
            <p className="texto-suave pista-pregunta">Pista: {pregunta.pista}</p>
          )}
          <input
            type="text"
            className="campo-input input-completacion"
            placeholder="Escribe aquí la palabra o término que completa la frase..."
            value={textoRespuesta}
            disabled={acertada || enviando}
            onChange={(e) => {
              setTextoRespuesta(e.target.value)
              setMensaje('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                responder()
              }
            }}
            autoFocus
          />
        </div>
      )}

      {tipo === 'desarrollo' && (
        <div className="cuestionario-entrada-texto">
          {pregunta.pista && (
            <p className="texto-suave pista-pregunta">Guía: {pregunta.pista}</p>
          )}
          <textarea
            rows="4"
            className="campo-input campo-textarea input-desarrollo"
            placeholder="Redacta tu explicación con tus propias palabras..."
            value={textoRespuesta}
            disabled={acertada || enviando}
            onChange={(e) => {
              setTextoRespuesta(e.target.value)
              setMensaje('')
            }}
            autoFocus
          />
          <div className="desarrollo-contador">
            <span className={palabrasActuales >= minPalabras ? 'ok' : ''}>
              {palabrasActuales} / {minPalabras} palabras mínimas
            </span>
            {detalles?.encontradas?.length > 0 && (
              <span>Conceptos cubiertos: {detalles.encontradas.join(', ')}</span>
            )}
          </div>
        </div>
      )}

      <p className={acertada ? 'resultado bien' : 'resultado'} role="status">
        {mensaje}
      </p>

      <div className="cuestionario-pie">
        {acertada && alContinuar ? (
          <>
            <span className="texto-suave">Ya puedes seguir con el video</span>
            <button key="continuar" type="button" className="boton" onClick={alContinuar} autoFocus>
              Continuar
            </button>
          </>
        ) : (
          <>
            <span className="texto-suave">
              {modoRepaso
                ? 'Modo repaso: mejora tu porcentaje de aciertos para el certificado'
                : !acertada &&
                  (intento === 1
                    ? `Suma ${xpPorRespuesta(intento)} XP si aciertas al primer intento`
                    : `Si aciertas ahora suma ${xpPorRespuesta(intento)} XP`)}
            </span>
            <button
              key="responder"
              type="button"
              className="boton"
              aria-disabled={acertada || enviando || !tieneEntradaValida}
              onClick={responder}
            >
              {enviando ? 'Evaluando…' : 'Responder'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default Cuestionario
