import BarraProgreso from '../components/BarraProgreso.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'

function Logros() {
  const { logros } = useProgreso()
  const desbloqueados = logros.filter((logro) => logro.desbloqueado).length

  return (
    <>
      <section className="encabezado">
        <h1>Logros</h1>
        <p>
          Tienes {desbloqueados} de {logros.length} desbloqueados. Se actualizan automáticamente con tu progreso real.
        </p>
      </section>

      <div className="logros">
        {logros.map((logro) => (
          <div key={logro.id} className={logro.desbloqueado ? 'logro' : 'logro bloqueado'}>
            <span className="logro-insignia">{logro.icono}</span>
            <h3>{logro.titulo}</h3>
            <p className="texto-suave">{logro.descripcion}</p>

            {logro.desbloqueado ? (
              <p className="logro-fecha">Ganado el {logro.fecha}</p>
            ) : (
              <>
                <BarraProgreso porcentaje={(logro.progreso / Math.max(1, logro.meta)) * 100} />
                <p className="texto-suave">
                  {logro.progreso} de {logro.meta}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export default Logros
