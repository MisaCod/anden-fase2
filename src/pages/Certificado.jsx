import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../servicios/api.js'

function Certificado() {
  const { cursoId } = useParams()
  const [cert, setCert] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError('')
    apiFetch(`/api/certificados/curso/${cursoId}`)
      .then((data) => {
        if (activo) setCert(data)
      })
      .catch((err) => {
        if (activo) setError(err.message || 'No se pudo cargar el certificado.')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [cursoId])

  if (cargando) {
    return <p className="texto-suave">Cargando certificado…</p>
  }

  if (error || !cert) {
    return (
      <section className="encabezado">
        <h1>Certificado aún no disponible</h1>
        <p className="texto-suave">{error}</p>
        <div className="botones" style={{ marginTop: '1rem' }}>
          <Link to={'/aula/' + cursoId} className="boton">Ir al curso</Link>
          <Link to="/progreso" className="boton boton-claro">Volver a mi progreso</Link>
        </div>
      </section>
    )
  }

  return (
    <div className="certificado-pagina" style={{ '--color-linea': cert.cursoColor }}>
      <div className="certificado-acciones no-print">
        <Link to="/progreso" className="boton boton-claro">← Volver a mi progreso</Link>
        <button type="button" className="boton" onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
      </div>

      <article className="diploma">
        <div className="diploma-borde">
          <div className="diploma-cabecera">
            <div className="logo">
              <span className="logo-punto"></span>
              andén
            </div>
            <span className="diploma-etiqueta">CERTIFICADO DE FINALIZACIÓN</span>
          </div>

          <p className="diploma-sub">Se certifica que</p>
          <h1 className="diploma-nombre">{cert.estudianteNombre}</h1>

          <p className="diploma-texto">
            completó satisfactoriamente el curso de microaprendizaje interactivo
          </p>

          <h2 className="diploma-curso">{cert.cursoTitulo}</h2>
          <p className="diploma-meta">
            Categoría: <strong>{cert.cursoCategoria}</strong> · Nivel: <strong>{cert.cursoNivel}</strong> · {cert.totalLecciones} lecciones aprobadas
          </p>

          <div className="diploma-nota">
            <div>
              <span>Porcentaje de aciertos</span>
              <strong>{cert.porcentajeAciertos}%</strong>
            </div>
            <div>
              <span>Mínimo aprobatorio</span>
              <strong>{cert.umbralCertificado}%</strong>
            </div>
            <div>
              <span>Fecha de emisión</span>
              <strong>{cert.emitidoEn}</strong>
            </div>
          </div>

          <div className="diploma-pie">
            <div>
              <p className="diploma-firma">Plataforma andén · Programación Web URBE</p>
              <p className="texto-suave">Evaluación continua por checkpoints interactivos</p>
            </div>
            <div className="diploma-codigo">
              <span>Código de verificación</span>
              <code>{cert.codigo}</code>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

export default Certificado
