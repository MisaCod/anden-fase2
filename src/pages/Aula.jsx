import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useCursos } from '../contextos/CursosContext.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import BarraProgreso from '../components/BarraProgreso.jsx'
import ModalAccesoCurso from '../components/ModalAccesoCurso.jsx'
import Reproductor from '../components/Reproductor.jsx'
import TituloParada from '../components/TituloParada.jsx'
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

function MensajeAula({ titulo, detalle }) {
  return (
    <section className="encabezado">
      <h1>{titulo}</h1>
      <p>
        {detalle || (
          <>
            Elige otro curso en <Link to="/cursos" className="enlace">Cursos</Link>.
          </>
        )}
      </p>
    </section>
  )
}

function Aula() {
  const { cursos, cargandoCursos } = useCursos()
  const { cursoId, leccionId } = useParams()
  const { progreso, estadisticasPorCurso, certificados } = useProgreso()
  const [mostrarModalAcceso, setMostrarModalAcceso] = useState(false)
  const [modoRepaso, setModoRepaso] = useState(false)

  if (cargandoCursos && cursos.length === 0) {
    return <p className="texto-suave">Cargando aula…</p>
  }

  const cursosAccesibles = cursos.filter((c) => c.tieneAcceso !== false && c.prelacionCumplida !== false)
  const seguir = leccionParaSeguir(cursosAccesibles, progreso)

  let curso
  if (cursoId) curso = cursos.find((c) => c.id === Number(cursoId))
  else if (seguir) curso = seguir.curso
  else curso = cursosAccesibles[0] || cursos[0]

  if (!curso) return <MensajeAula titulo="No encontramos ese curso" />

  // Guard 1: curso restringido sin permiso
  if (curso.tieneAcceso === false) {
    return (
      <div className="aula-entorno" style={{ '--color-linea': curso.color }}>
        <section className="encabezado aula-bloqueo-card">
          <span className="etiqueta-acceso restringido">Curso restringido</span>
          <h1>{curso.titulo}</h1>
          <p>{curso.descripcion}</p>
          <p className="texto-suave">
            {curso.estadoAcceso === 'pendiente'
              ? 'Tu solicitud de acceso está pendiente de aprobación por un profesor o administrador.'
              : 'Este curso requiere permiso del profesor o realizar el pago simulado para desbloquear sus lecciones.'}
          </p>
          <div className="botones">
            <button
              type="button"
              className="boton"
              onClick={() => setMostrarModalAcceso(true)}
            >
              {curso.estadoAcceso === 'pendiente' ? 'Ver solicitud / Pago simulado' : 'Solicitar acceso o pagar'}
            </button>
            <Link to="/cursos" className="boton boton-claro">Volver al catálogo</Link>
          </div>
        </section>

        {mostrarModalAcceso && (
          <ModalAccesoCurso curso={curso} alCerrar={() => setMostrarModalAcceso(false)} />
        )}
      </div>
    )
  }

  // Guard 2: prelación de curso no cumplida
  if (curso.prelacionCumplida === false && curso.prerequisitoCursoId) {
    return (
      <div className="aula-entorno" style={{ '--color-linea': curso.color }}>
        <section className="encabezado aula-bloqueo-card">
          <span className="etiqueta-prelacion falta">Prelación requerida</span>
          <h1>Completa primero {curso.prerequisitoTitulo}</h1>
          <p className="texto-suave">
            Para cursar <strong>{curso.titulo}</strong> primero debes finalizar todas las lecciones de{' '}
            <strong>{curso.prerequisitoTitulo}</strong>.
          </p>
          <div className="botones">
            <Link to={'/aula/' + curso.prerequisitoCursoId} className="boton">
              Ir a {curso.prerequisitoTitulo}
            </Link>
            <Link to="/cursos" className="boton boton-claro">Volver a cursos</Link>
          </div>
        </section>
      </div>
    )
  }

  const lecciones = leccionesDe(curso)
  let leccion
  if (leccionId) leccion = lecciones.find((l) => l.id === Number(leccionId))
  else if (!cursoId && seguir && seguir.curso.id === curso.id) leccion = seguir.leccion
  else leccion = leccionActual(curso, progreso) || lecciones[0]

  if (!leccion) return <MensajeAula titulo="No encontramos esa lección" />

  if (!leccionId) return <Navigate to={'/aula/' + curso.id + '/' + leccion.id} replace />

  if (estadoLeccion(curso, leccion, progreso) === 'pendiente') {
    const actual = leccionActual(curso, progreso)
    return (
      <div className="aula-entorno" style={{ '--color-linea': curso.color }}>
        <section className="encabezado aula-bloqueo-card">
          <h1>Lección bloqueada</h1>
          <p>
            Primero termina{' '}
            <Link to={'/aula/' + curso.id + '/' + actual.id} className="enlace">
              {actual.titulo}
            </Link>
            .
          </p>
        </section>
      </div>
    )
  }

  const modulo = curso.modulos.find((m) => m.lecciones.includes(leccion))
  const statsCurso = estadisticasPorCurso[String(curso.id)]
  const porcentaje = statsCurso ? statsCurso.porcentajeAvance : porcentajeCurso(curso, progreso)
  const certificado = certificados.find((c) => c.cursoId === curso.id)
  const leccionCompletada = avanceDe(progreso, leccion.id).completada

  return (
    <div className="aula-entorno" style={{ '--color-linea': curso.color }}>
      <section className="encabezado aula-encabezado-tematico">
        <div className="aula-encabezado-superior">
          <div>
            <p className="aula-ruta-migas">
              <span className="aula-badge-cat">{curso.categoria}</span>
              {curso.titulo} · {modulo?.titulo}
            </p>
            <h1>{leccion.titulo}</h1>
          </div>

          <div className="aula-metricas-rapidas">
            {statsCurso && statsCurso.preguntasRespondidas > 0 && (
              <div className="aula-aciertos-pill">
                <span>Aciertos del curso</span>
                <strong>
                  {statsCurso.porcentajeAciertos}%{' '}
                  <small>(mín. {statsCurso.umbralCertificado}%)</small>
                </strong>
              </div>
            )}
            {certificado && (
              <Link to={'/certificado/' + curso.id} className="boton boton-certificado-pill">
                Ver certificado
              </Link>
            )}
            {leccionCompletada && (leccion.cuestionarios || []).length > 0 && (
              <button
                type="button"
                className={`boton ${modoRepaso ? '' : 'boton-claro'}`}
                onClick={() => setModoRepaso((prev) => !prev)}
              >
                {modoRepaso ? 'Salir de repaso de preguntas' : 'Repasar preguntas'}
              </button>
            )}
          </div>
        </div>

        <div className="progreso-curso">
          <BarraProgreso porcentaje={porcentaje} />
          <span>{porcentaje}%</span>
        </div>
      </section>

      <div className="aula">
        <div>
          <Reproductor
            key={`${leccion.id}-${modoRepaso ? 'repaso' : 'normal'}`}
            curso={curso}
            leccion={leccion}
            siguiente={siguienteLeccion(curso, leccion)}
            modoRepaso={modoRepaso}
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
