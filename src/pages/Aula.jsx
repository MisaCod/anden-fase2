import { Link, Navigate, useParams } from 'react-router-dom'
import { useCursos } from '../contextos/CursosContext.jsx'
import BarraProgreso from '../components/BarraProgreso.jsx'
import Reproductor from '../components/Reproductor.jsx'
import TituloParada from '../components/TituloParada.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { formatoTiempo } from '../logica/formato.js'
import {
  avanceDe,
  estadoLeccion,
  leccionActual,
  leccionesDe,
  leccionParaSeguir,
  porcentajeCurso,
  siguienteLeccion,
} from '../logica/progreso.js'

// Mensaje para cuando no hay una lección que mostrar
function MensajeAula({ titulo }) {
  return (
    <section className="encabezado">
      <h1>{titulo}</h1>
      <p>
        Elige otro curso en <Link to="/cursos" className="enlace">Cursos</Link>.
      </p>
    </section>
  )
}

function Aula() {
  const { cursos } = useCursos()
  // Los parámetros de la URL (/aula/1/102) llegan como texto, igual que $_GET en PHP
  const { cursoId, leccionId } = useParams()
  const { progreso } = useProgreso()

  // Sin parámetros se abre la misma lección que propone Inicio
  const seguir = leccionParaSeguir(cursos, progreso)

  // 1. El curso: el de la URL o, si no viene, el de la lección para seguir
  let curso
  if (cursoId) curso = cursos.find((c) => c.id === Number(cursoId))
  else if (seguir) curso = seguir.curso
  else curso = cursos[0]

  if (!curso) return <MensajeAula titulo="No encontramos ese curso" />

  // 2. La lección: la de la URL; sin parámetros, la que propone Inicio;
  // si no, la actual del curso (o la primera si ya terminó)
  const lecciones = leccionesDe(curso)
  let leccion
  if (leccionId) leccion = lecciones.find((l) => l.id === Number(leccionId))
  else if (!cursoId && seguir) leccion = seguir.leccion
  else leccion = leccionActual(curso, progreso) || lecciones[0]

  if (!leccion) return <MensajeAula titulo="No encontramos esa lección" />

  // Sin lección en la URL se pasa a la dirección completa, como header('Location') en PHP.
  // Así la lección queda fija y no cambia sola al completarla. replace evita que Atrás vuelva aquí
  if (!leccionId) return <Navigate to={'/aula/' + curso.id + '/' + leccion.id} replace />

  // 3. Las lecciones se abren en orden: las pendientes están bloqueadas
  if (estadoLeccion(curso, leccion, progreso) === 'pendiente') {
    // Si hay una pendiente, el curso no está terminado: siempre hay una lección actual
    const actual = leccionActual(curso, progreso)
    return (
      <section className="encabezado">
        <h1>Lección bloqueada</h1>
        <p>
          Primero termina{' '}
          <Link to={'/aula/' + curso.id + '/' + actual.id} className="enlace">{actual.titulo}</Link>.
        </p>
      </section>
    )
  }

  const modulo = curso.modulos.find((m) => m.lecciones.includes(leccion))
  const porcentaje = porcentajeCurso(curso, progreso)

  return (
    <div style={{ '--color-linea': curso.color }}>
      <section className="encabezado">
        <p>
          {curso.titulo}, módulo {modulo.id}: {modulo.titulo}
        </p>
        <h1>{leccion.titulo}</h1>
        <div className="progreso-curso">
          <BarraProgreso porcentaje={porcentaje} />
          <span>{porcentaje}%</span>
        </div>
      </section>

      <div className="aula">
        <div>
          {/* key: al cambiar de lección el reproductor empieza de cero */}
          <Reproductor
            key={leccion.id}
            curso={curso}
            leccion={leccion}
            siguiente={siguienteLeccion(curso, leccion)}
          />
        </div>

        <aside className="temario">
          <h2>Contenido</h2>

          {curso.modulos.map((m) => (
            <div key={m.id} className="modulo">
              <h3>{m.titulo}</h3>
              <ol className="ruta ruta-vertical">
                {m.lecciones.map((l) => {
                  const estado = estadoLeccion(curso, l, progreso)
                  return (
                    <li key={l.id} className={'parada ' + estado}>
                      <span className="punto"></span>
                      <TituloParada
                        cursoId={curso.id}
                        leccion={l}
                        estado={estado}
                        abierta={l.id === leccion.id}
                      />
                      <span className="parada-detalle">
                        {estado === 'actual' ? formatoTiempo(avanceDe(progreso, l.id).maximo) + ' / ' : ''}
                        {formatoTiempo(l.duracion)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}

export default Aula
