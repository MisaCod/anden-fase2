import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useCursos } from '../contextos/CursosContext.jsx'

function ModalAccesoCurso({ curso, alCerrar }) {
  const { usuarioActual } = useAuth()
  const { solicitarAccesoCurso, pagarCursoSimulado } = useCursos()
  const navigate = useNavigate()

  const [opcion, setOpcion] = useState('solicitar') // 'solicitar' | 'pagar'
  const [mensaje, setMensaje] = useState(
    `Hola profesor, soy ${usuarioActual?.nombre || 'estudiante'} y me gustaría solicitar acceso al curso "${curso.titulo}".`
  )
  const [metodoPago, setMetodoPago] = useState('Pago Móvil demo')
  const [titular, setTitular] = useState(usuarioActual?.nombre || '')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  async function handleSolicitar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const res = await solicitarAccesoCurso(curso.id, mensaje)
    setEnviando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResultado({ tipo: 'solicitud', texto: res.mensaje })
  }

  async function handlePagoSimulado(e) {
    e.preventDefault()
    setError('')
    if (!titular.trim()) {
      setError('Indica el nombre del titular para generar el comprobante simulado.')
      return
    }
    setEnviando(true)
    const res = await pagarCursoSimulado(curso.id, { metodoPago, titular })
    setEnviando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResultado({
      tipo: 'pago',
      texto: res.mensaje,
      referencia: res.referencia,
    })
  }

  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" aria-labelledby="modal-acceso-titulo">
      <div className="modal-caja" style={{ '--color-linea': curso.color }}>
        <div className="modal-cabecera">
          <div>
            <span className="badge-restringido">Curso restringido</span>
            <h2 id="modal-acceso-titulo">{curso.titulo}</h2>
            <p className="texto-suave">
              {curso.categoria} · {curso.nivel}
              {curso.precio > 0 ? ` · $${curso.precio.toFixed(2)} USD (simulado)` : ''}
            </p>
          </div>
          <button type="button" className="modal-cerrar" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        {resultado ? (
          <div className="modal-resultado">
            <div className="alerta-exito">
              <strong>{resultado.tipo === 'pago' ? '¡Acceso habilitado!' : '¡Solicitud enviada!'}</strong>
              <p>{resultado.texto}</p>
              {resultado.referencia && (
                <p className="texto-suave">Comprobante demo: <code>{resultado.referencia}</code></p>
              )}
            </div>
            <div className="botones">
              {resultado.tipo === 'pago' && curso.prelacionCumplida && (
                <button
                  type="button"
                  className="boton"
                  onClick={() => {
                    alCerrar()
                    navigate(`/aula/${curso.id}`)
                  }}
                >
                  Entrar al curso ahora
                </button>
              )}
              <button type="button" className="boton boton-claro" onClick={alCerrar}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            {curso.estadoAcceso === 'pendiente' && (
              <div className="alerta-info">
                Ya enviaste una solicitud al profesor y está <strong>pendiente de aprobación</strong>. Si prefieres entrar al instante, también puedes usar el pago simulado.
              </div>
            )}

            <div className="modal-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={opcion === 'solicitar'}
                className={`modal-tab ${opcion === 'solicitar' ? 'activo' : ''}`}
                onClick={() => {
                  setOpcion('solicitar')
                  setError('')
                }}
              >
                Contactar a un profesor
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={opcion === 'pagar'}
                className={`modal-tab ${opcion === 'pagar' ? 'activo' : ''}`}
                onClick={() => {
                  setOpcion('pagar')
                  setError('')
                }}
              >
                Simular pago {curso.precio > 0 ? `($${curso.precio.toFixed(2)})` : ''}
              </button>
            </div>

            {error && <div className="alerta-error">{error}</div>}

            {opcion === 'solicitar' ? (
              <form onSubmit={handleSolicitar} className="modal-formulario">
                <div className="campo-grupo">
                  <label htmlFor="msg-solicitud" className="campo-etiqueta">
                    Mensaje para el profesor o administrador
                  </label>
                  <textarea
                    id="msg-solicitud"
                    rows="3"
                    className="campo-input campo-textarea"
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    required
                  />
                </div>
                <div className="botones">
                  <button type="submit" className="boton" disabled={enviando}>
                    {enviando ? 'Enviando…' : 'Enviar solicitud de acceso'}
                  </button>
                  <button type="button" className="boton boton-claro" onClick={alCerrar}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handlePagoSimulado} className="modal-formulario">
                <p className="texto-suave nota-simulacion">
                  <strong>Simulación académica:</strong> este formulario no cobra dinero real; registra una referencia de prueba en SQLite y desbloquea el curso al instante.
                </p>

                <div className="campo-grupo">
                  <label htmlFor="pago-metodo" className="campo-etiqueta">
                    Método de pago (simulado)
                  </label>
                  <select
                    id="pago-metodo"
                    className="campo-input"
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                  >
                    <option value="Pago Móvil demo">Pago Móvil (demo)</option>
                    <option value="Tarjeta demo">Tarjeta de débito / crédito (demo)</option>
                    <option value="Transferencia demo">Transferencia bancaria (demo)</option>
                  </select>
                </div>

                <div className="campo-grupo">
                  <label htmlFor="pago-titular" className="campo-etiqueta">
                    Nombre del titular
                  </label>
                  <input
                    id="pago-titular"
                    type="text"
                    className="campo-input"
                    value={titular}
                    onChange={(e) => setTitular(e.target.value)}
                    required
                  />
                </div>

                <div className="pago-resumen">
                  <span>Total simulado</span>
                  <strong>${(curso.precio || 0).toFixed(2)} USD</strong>
                </div>

                <div className="botones">
                  <button type="submit" className="boton" disabled={enviando}>
                    {enviando ? 'Procesando…' : 'Confirmar pago simulado y desbloquear'}
                  </button>
                  <button type="button" className="boton boton-claro" onClick={alCerrar}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ModalAccesoCurso
