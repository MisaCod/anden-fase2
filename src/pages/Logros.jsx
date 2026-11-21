import usuario from '../data/usuario.json'
import BarraProgreso from '../components/BarraProgreso.jsx'

function Logros() {
  const desbloqueados = usuario.logros.filter((logro) => logro.desbloqueado).length

  return (
    <>
      <section className="encabezado">
        <h1>Logros</h1>
        <p>Tienes {desbloqueados} de {usuario.logros.length}. Los grises aún están por ganar.</p>
      </section>

      <div className="logros">
        {usuario.logros.map((logro) => (
          <div key={logro.id} className={logro.desbloqueado ? 'logro' : 'logro bloqueado'}>
            <span className="logro-insignia">{logro.icono}</span>
            <h3>{logro.titulo}</h3>
            <p className="texto-suave">{logro.descripcion}</p>

            {logro.desbloqueado ? (
              <p className="logro-fecha">Ganado el {logro.fecha}</p>
            ) : (
              <>
                <BarraProgreso porcentaje={(logro.progreso / logro.meta) * 100} />
                <p className="texto-suave">{logro.progreso} de {logro.meta}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export default Logros
