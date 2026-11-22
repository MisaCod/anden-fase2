import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useCursos } from '../contextos/CursosContext.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import FilaCurso from '../components/FilaCurso.jsx'
import ModalAccesoCurso from '../components/ModalAccesoCurso.jsx'
import TituloParada from '../components/TituloParada.jsx'
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
  const { usuarioActual } = useAuth()
  const { cursos } = useCursos()
  const { progreso, certificados } = useProgreso()
  const [cursoModal, setCursoModal] = useState(null)

  const cursosAccesibles = cursos.filter((c) => c.tieneAcceso !== false && c.prelacionCumplida !== false)
  const enProgreso = cursosAccesibles.filter((c) => cursoEmpezado(c, progreso) && !cursoTerminado(c, progreso))
  const seguir = leccionParaSeguir(cursosAccesibles, progreso)
  const primerCursoLibre = cursosAccesibles.find((c) => !cursoTerminado(c, progreso)) || cursosAccesibles[0]

  const primerNombre = usuarioActual?.primerNombre || 'Estudiante'

  if (!seguir) {
    return (
      <>
        <section className="hero">
          <p className="hero-saludo">Hola, {primerNombre}.</p>
          <h1 className="hero-titulo">
            {cursosAccesibles.length > 0 && cursosAccesibles.every((c) => cursoTerminado(c, progreso))
              ? 'Terminaste todo lo que empezaste'
              : 'Empieza tu primera línea de aprendizaje'}
          </h1>
          <p className="hero-detalle">
            {primerCursoLibre
              ? `Puedes comenzar gratis con "${primerCursoLibre.titulo}" o explorar todo el catálogo.`
              : 'Explora los cursos disponibles en el catálogo.'}
          </p>
          <div className="botones">
            {primerCursoLibre && (
              <Link to={'/aula/' + primerCursoLibre.id} className="boton">
                Empezar {primerCursoLibre.titulo}
              </Link>
            )}
            <Link to="/cursos" className="boton boton-claro">Ver cursos</Link>
          </div>
        </section>

        {certificados.length > 0 && (
          <section className="seccion">
            <div className="seccion-titulo">
              <h2>Tus certificados</h2>
              <Link to="/progreso" className="enlace">Ver mi progreso</Link>
            </div>
            <div className="certificados-grid">
              {certificados.map((cert) => (
                <Link key={cert.id} to={`/certificado/${cert.cursoId}`} className="certificado-mini" style={{ '--color-linea': cert.cursoColor }}>
                  <span className="certificado-sello">✪</span>
                  <div>
                    <h3>{cert.cursoTitulo}</h3>
                    <p className="texto-suave">{cert.porcentajeAciertos}% de aciertos · {cert.codigo}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="seccion">
          <div className="seccion-titulo">
            <h2>Cursos disponibles</h2>
            <Link to="/cursos" className="enlace">Ver catálogo completo</Link>
          </div>
          <div className="lista-cursos">
            {cursos.slice(0, 4).map((c) => (
              <FilaCurso key={c.id} curso={c} alSolicitarAcceso={(cur) => setCursoModal(cur)} />
            ))}
          </div>
        </section>

        {cursoModal && (
          <ModalAccesoCurso curso={cursoModal} alCerrar={() => setCursoModal(null)} />
        )}
      </>
    )
  }

  const curso = seguir.curso
  const leccion = seguir.leccion
  const lecciones = leccionesDe(curso)
  const numero = lecciones.indexOf(leccion) + 1
  const visto = avanceDe(progreso, leccion.id).maximo

  return (
    <>
      <section className="hero" style={{ '--color-linea': curso.color }}>
        <p className="hero-saludo">
          Hola, {primerNombre}. {visto > 0 ? 'Te quedaste en' : 'Lo que sigue es'}
        </p>
        <h1 className="hero-titulo">{leccion.titulo}</h1>
        <p className="hero-detalle">
          {curso.titulo}, lección {numero} de {lecciones.length}. Te falta{' '}
          {formatoTiempo(Math.max(0, leccion.duracion - visto))}.
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

      {enProgreso.length > 0 && (
        <section className="seccion">
          <h2>Tus cursos en progreso</h2>
          <div className="lista-cursos">
            {enProgreso.map((c) => (
              <FilaCurso key={c.id} curso={c} alSolicitarAcceso={(cur) => setCursoModal(cur)} />
            ))}
          </div>
        </section>
      )}

      {certificados.length > 0 && (
        <section className="seccion">
          <div className="seccion-titulo">
            <h2>Certificados obtenidos</h2>
            <Link to="/progreso" className="enlace">Ver mi progreso</Link>
          </div>
          <div className="certificados-grid">
            {certificados.map((cert) => (
              <Link key={cert.id} to={`/certificado/${cert.cursoId}`} className="certificado-mini" style={{ '--color-linea': cert.cursoColor }}>
                <span className="certificado-sello">✪</span>
                <div>
                  <h3>{cert.cursoTitulo}</h3>
                  <p className="texto-suave">{cert.porcentajeAciertos}% aciertos · Código {cert.codigo}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {cursoModal && (
        <ModalAccesoCurso curso={cursoModal} alCerrar={() => setCursoModal(null)} />
      )}
    </>
  )
}

export default Inicio
