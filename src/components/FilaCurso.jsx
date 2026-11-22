import { Link } from 'react-router-dom'
import BarraProgreso from './BarraProgreso.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { cursoEmpezado, cursoTerminado, leccionesDe, porcentajeCurso } from '../logica/progreso.js'

function textoBoton(curso, progreso) {
  if (cursoTerminado(curso, progreso)) return 'Repasar'
  if (cursoEmpezado(curso, progreso)) return 'Continuar'
  return 'Empezar'
}

function FilaCurso({ curso, alSolicitarAcceso }) {
  const { progreso, estadisticasPorCurso, certificados } = useProgreso()
  const lecciones = leccionesDe(curso)
  const stats = estadisticasPorCurso[String(curso.id)]
  const porcentaje = stats ? stats.porcentajeAvance : porcentajeCurso(curso, progreso)
  const certificado = certificados.find((c) => c.cursoId === curso.id)

  let segundos = 0
  for (const leccion of lecciones) segundos += leccion.duracion
  const minutos = Math.ceil(segundos / 60)

  const sinAcceso = curso.tieneAcceso === false
  const sinPrelacion = curso.prelacionCumplida === false

  return (
    <article
      className={`fila-curso ${sinAcceso || sinPrelacion ? 'fila-curso-bloqueada' : ''}`}
      style={{ '--color-linea': curso.color }}
    >
      <span className="insignia">{curso.id}</span>

      <div>
        <div className="fila-curso-cabecera">
          <h3>{curso.titulo}</h3>
          <div className="fila-curso-badges">
            {curso.tipoAcceso === 'gratis' ? (
              <span className="etiqueta-acceso gratis">Gratis</span>
            ) : curso.tieneAcceso ? (
              <span className="etiqueta-acceso aprobado">Acceso habilitado</span>
            ) : curso.estadoAcceso === 'pendiente' ? (
              <span className="etiqueta-acceso pendiente">Solicitud pendiente</span>
            ) : (
              <span className="etiqueta-acceso restringido">
                Restringido{curso.precio > 0 ? ` · $${curso.precio.toFixed(2)}` : ''}
              </span>
            )}

            {curso.prerequisitoTitulo && (
              <span className={`etiqueta-prelacion ${sinPrelacion ? 'falta' : 'cumplida'}`}>
                {sinPrelacion ? `Requiere: ${curso.prerequisitoTitulo}` : `Prelación cumplida`}
              </span>
            )}
          </div>
        </div>

        <p className="texto-suave">{curso.descripcion}</p>
        <p className="meta">
          {curso.categoria} · {curso.nivel} · {lecciones.length} lecciones · {minutos} min
          {stats && stats.preguntasRespondidas > 0 && (
            <> · <strong>{stats.porcentajeAciertos}% aciertos</strong></>
          )}
        </p>
      </div>

      <div className="fila-curso-progreso">
        <span>{porcentaje}%</span>
        <BarraProgreso porcentaje={porcentaje} />
      </div>

      <div className="fila-curso-acciones">
        {sinAcceso ? (
          <button
            type="button"
            className="boton"
            onClick={() => alSolicitarAcceso && alSolicitarAcceso(curso)}
          >
            {curso.estadoAcceso === 'pendiente' ? 'Ver solicitud / pagar' : 'Solicitar acceso'}
          </button>
        ) : sinPrelacion ? (
          <Link to={'/aula/' + curso.prerequisitoCursoId} className="boton boton-claro">
            Completar previo
          </Link>
        ) : (
          <>
            <Link to={'/aula/' + curso.id} className="boton boton-claro">
              {textoBoton(curso, progreso)}
            </Link>
            {certificado && (
              <Link to={'/certificado/' + curso.id} className="enlace-certificado-mini">
                Certificado
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  )
}

export default FilaCurso
