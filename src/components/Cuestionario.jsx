import { useState } from 'react'
import { formatoTiempo } from '../logica/formato.js'
import { xpPorRespuesta } from '../logica/gamificacion.js'

const letras = ['A', 'B', 'C', 'D']

// Una pregunta de opción múltiple.
// Props: pregunta (del JSON), alResponder(opcion, intento), que avisa al padre en cada intento,
// y alContinuar (opcional): si viene, al acertar aparece el botón "Continuar"
function Cuestionario({ pregunta, alResponder, alContinuar }) {
  const [seleccion, setSeleccion] = useState(null) // índice de la opción marcada
  const [intento, setIntento] = useState(1)
  const [fallidas, setFallidas] = useState([]) // opciones que ya se probaron y no eran
  const [acertada, setAcertada] = useState(false)

  function responder() {
    // El botón usa aria-disabled y sigue recibiendo Enter: sin opción elegida o ya acertada, no hace nada
    if (acertada || seleccion === null) return
    alResponder(seleccion, intento)

    if (seleccion === pregunta.correcta) {
      setAcertada(true)
    } else {
      // La opción fallada queda tachada y se puede volver a intentar con otra
      setFallidas([...fallidas, seleccion])
      setSeleccion(null)
      setIntento(intento + 1)
    }
  }

  // El error se borra al elegir otra opción: si vuelve a fallar, el texto
  // aparece de nuevo y role="status" lo anuncia otra vez
  let mensaje = ''
  if (acertada) mensaje = '¡Correcto! ' + pregunta.explicacion
  else if (fallidas.length > 0 && seleccion === null) mensaje = 'No es correcta. Intenta de nuevo.'

  const idTitulo = 'pregunta-' + pregunta.id

  return (
    <div className="cuestionario">
      <p className="texto-suave">Pregunta a los {formatoTiempo(pregunta.segundo)}</p>
      {/* h2: va justo debajo del h1 de la lección, sin saltar niveles */}
      <h2 id={idTitulo}>{pregunta.pregunta}</h2>

      {/* Al aparecer, el foco va a la opción A; el grupo hace que se lea la pregunta al entrar */}
      <div className="opciones" role="group" aria-labelledby={idTitulo}>
        {pregunta.opciones.map((opcion, i) => {
          // Cada opción se pinta según lo que ya pasó con ella
          let clase = 'opcion'
          if (fallidas.includes(i)) clase += ' incorrecta'
          if (acertada && i === pregunta.correcta) clase += ' correcta'
          if (!acertada && i === seleccion) clase += ' seleccionada'

          return (
            <button
              key={opcion}
              className={clase}
              disabled={acertada || fallidas.includes(i)}
              aria-pressed={i === seleccion}
              onClick={() => setSeleccion(i)}
              autoFocus={i === 0}
            >
              <span className="opcion-letra">{letras[i]}</span>
              {opcion}
            </button>
          )
        })}
      </div>

      {/* role="status" hace que los lectores de pantalla lean el mensaje cuando cambia */}
      <p className={acertada ? 'resultado bien' : 'resultado'} role="status">
        {mensaje}
      </p>

      {/* El pie siempre está. Cada botón tiene su key: React crea "Continuar" nuevo y su autoFocus le pasa el foco */}
      <div className="cuestionario-pie">
        {acertada && alContinuar ? (
          <>
            <span className="texto-suave">Ya puedes seguir con el video</span>
            <button key="continuar" className="boton" onClick={alContinuar} autoFocus>
              Continuar
            </button>
          </>
        ) : (
          <>
            <span className="texto-suave">
              {!acertada &&
                (intento === 1
                  ? 'Suma ' + xpPorRespuesta(intento) + ' XP si aciertas al primer intento'
                  : 'Si aciertas ahora suma ' + xpPorRespuesta(intento) + ' XP')}
            </span>
            {/* aria-disabled en vez de disabled: se ve y se anuncia apagado, pero no pierde el foco */}
            <button
              key="responder"
              className="boton"
              aria-disabled={acertada || seleccion === null}
              onClick={responder}
            >
              Responder
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default Cuestionario
