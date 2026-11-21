import { Link } from 'react-router-dom'
import usuario from '../data/usuario.json'
import BarraProgreso from '../components/BarraProgreso.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { XP_POR_NIVEL } from '../logica/gamificacion.js'

function Progreso() {
  const { resumen, reiniciar } = useProgreso()

  // Los días seguidos, el árbol y los logros siguen fijos en el JSON hasta la Fase 3
  const estadisticas = [
    { titulo: 'días seguidos estudiando', valor: usuario.diasSeguidos },
    { titulo: 'lecciones completadas', valor: resumen.leccionesCompletadas },
    { titulo: 'preguntas acertadas', valor: resumen.preguntasAcertadas },
    { titulo: 'minutos de estudio', valor: resumen.minutos },
  ]
  const logrosRecientes = usuario.logros.filter((logro) => logro.desbloqueado).slice(0, 3)

  return (
    <>
      <section className="encabezado">
        <h1>Mi progreso</h1>
        <p>Así va tu aprendizaje, {usuario.primerNombre}.</p>
      </section>

      <div className="nivel">
        <p className="nivel-numero">
          <span>Nivel</span>
          {resumen.nivel}
        </p>
        <div className="nivel-barra">
          <div className="nivel-texto">
            <strong>
              {resumen.xpEnNivel} de {XP_POR_NIVEL} XP
            </strong>
            <span className="texto-suave">
              {resumen.faltan} XP para llegar al nivel {resumen.nivel + 1}
            </span>
          </div>
          <BarraProgreso porcentaje={(resumen.xpEnNivel / XP_POR_NIVEL) * 100} />
        </div>
      </div>

      <div className="estadisticas">
        {estadisticas.map((dato) => (
          <p key={dato.titulo} className="estadistica">
            <strong>{dato.valor}</strong>
            <span>{dato.titulo}</span>
          </p>
        ))}
      </div>

      <section className="seccion">
        <h2>Habilidades</h2>
        <p className="texto-suave intro">
          Termina una habilidad para desbloquear la siguiente de su rama.
        </p>

        <div className="arbol">
          {usuario.habilidades.map((rama) => (
            <div key={rama.rama} className="rama" style={{ '--color-linea': rama.color }}>
              <h3>
                <span className="rama-color"></span>
                {rama.rama}
              </h3>
              <ol className="ruta ruta-vertical">
                {rama.nodos.map((nodo) => (
                  <li key={nodo.titulo} className={'parada ' + nodo.estado}>
                    <span className="punto"></span>
                    <span className="parada-titulo">{nodo.titulo}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="seccion">
        <div className="seccion-titulo">
          <h2>Logros recientes</h2>
          <Link to="/logros" className="enlace">Ver todos los logros</Link>
        </div>
        <div className="logros-recientes">
          {logrosRecientes.map((logro) => (
            <div key={logro.id} className="logro-mini">
              <span className="logro-insignia chica">{logro.icono}</span>
              <div>
                <h3>{logro.titulo}</h3>
                <p className="texto-suave">{logro.fecha}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="seccion">
        <h2>Tu avance guardado</h2>
        <p className="texto-suave intro">
          Tu progreso se guarda en este equipo. Si reinicias, vuelves al punto de partida.
        </p>
        <button className="boton boton-claro" onClick={reiniciar}>
          Reiniciar progreso
        </button>
      </section>
    </>
  )
}

export default Progreso
