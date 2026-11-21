import { Link } from 'react-router-dom'
import { useCursos } from '../contextos/CursosContext.jsx'
import usuario from '../data/usuario.json'
import FilaCurso from '../components/FilaCurso.jsx'
import TituloParada from '../components/TituloParada.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { formatoTiempo } from '../logica/formato.js'
import {
  avanceDe,
  cursoEmpezado,
  cursoTerminado,
  estadoLeccion,
  leccionesDe,
  leccionParaSeguir,
} from '../logica/progreso.js'

function Inicio() {
  const { cursos } = useCursos()
  const { progreso } = useProgreso()

  // Cursos empezados que todavía no se terminan
  const enProgreso = cursos.filter((c) => cursoEmpezado(c, progreso) && !cursoTerminado(c, progreso))

  // La lección que conviene seguir (null si ya terminaste todo lo que empezaste)
  const seguir = leccionParaSeguir(cursos, progreso)

  if (!seguir) {
    return (
      <section className="hero">
        <p className="hero-saludo">Hola, {usuario.primerNombre}.</p>
        <h1 className="hero-titulo">Terminaste todo lo que empezaste</h1>
        <p className="hero-detalle">Elige un curso nuevo para seguir sumando experiencia.</p>
        <div className="botones">
          <Link to="/cursos" className="boton">Ver cursos</Link>
        </div>
      </section>
    )
  }

  const curso = seguir.curso
  const leccion = seguir.leccion
  const lecciones = leccionesDe(curso)
  const numero = lecciones.indexOf(leccion) + 1
  const visto = avanceDe(progreso, leccion.id).maximo

  return (
    <>
      <section className="hero">
        <p className="hero-saludo">
          Hola, {usuario.primerNombre}. {visto > 0 ? 'Te quedaste en' : 'Lo que sigue es'}
        </p>
        <h1 className="hero-titulo">{leccion.titulo}</h1>
        <p className="hero-detalle">
          {curso.titulo}, lección {numero} de {lecciones.length}. Te falta{' '}
          {formatoTiempo(leccion.duracion - visto)}.
        </p>
        <div className="botones">
          <Link to={'/aula/' + curso.id + '/' + leccion.id} className="boton">
            Seguir la lección
          </Link>
          <Link to="/cursos" className="boton boton-claro">Ver cursos</Link>
        </div>
      </section>

      <div className="ruta-scroll">
        <ol className="ruta ruta-horizontal" style={{ '--color-linea': curso.color }}>
          {lecciones.map((l) => {
            const estado = estadoLeccion(curso, l, progreso)
            return (
              <li key={l.id} className={'parada ' + estado}>
                <span className="punto"></span>
                <TituloParada cursoId={curso.id} leccion={l} estado={estado} abierta={false} />
              </li>
            )
          })}
        </ol>
      </div>

      <section className="seccion">
        <h2>Tus cursos en progreso</h2>
        <div className="lista-cursos">
          {enProgreso.map((c) => (
            <FilaCurso key={c.id} curso={c} />
          ))}
        </div>
      </section>
    </>
  )
}

export default Inicio
