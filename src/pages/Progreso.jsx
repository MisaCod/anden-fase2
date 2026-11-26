import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BarraProgreso from '../components/BarraProgreso.jsx'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useCursos } from '../contextos/CursosContext.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { XP_POR_NIVEL } from '../logica/gamificacion.js'
import { apiFetch } from '../servicios/api.js'

function Progreso() {
  const { usuarioActual, esStaff } = useAuth()
  const { cursos } = useCursos()
  const { resumen, estadisticasPorCurso, habilidades, logros, certificados, reiniciar } = useProgreso()
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [valoracionDocente, setValoracionDocente] = useState(
    () => usuarioActual?.valoracionDocente || null
  )

  useEffect(() => {
    if (!esStaff) return
    let activo = true
    apiFetch('/api/docente/valoracion')
      .then((res) => {
        if (activo && res) setValoracionDocente(res)
      })
      .catch(() => {})
    return () => {
      activo = false
    }
  }, [esStaff, cursos])

  const estadisticas = [
    { titulo: 'días seguidos estudiando', valor: resumen.diasSeguidos },
    { titulo: 'lecciones completadas', valor: resumen.leccionesCompletadas },
    { titulo: 'preguntas acertadas', valor: resumen.preguntasAcertadas },
    { titulo: 'aciertos promedio', valor: `${resumen.porcentajeAciertosGlobal}%` },
    { titulo: 'minutos de estudio', valor: resumen.minutos },
    ...(esStaff
      ? [
          {
            titulo: 'promedio docente (videos)',
            valor:
              valoracionDocente?.promedio != null
                ? `${Number(valoracionDocente.promedio).toFixed(1)} / 5`
                : 'Sin datos',
          },
        ]
      : []),
  ]

  const logrosRecientes = logros.filter((logro) => logro.desbloqueado).slice(0, 3)

  // Cursos terminados que aún no cumplen el porcentaje mínimo del certificado
  const cursosPorMejorar = cursos.filter((c) => {
    const st = estadisticasPorCurso[String(c.id)]
    return st && st.completado && !st.elegibleCertificado
  })

  async function confirmarReiniciar() {
    setReiniciando(true)
    await reiniciar()
    setReiniciando(false)
    setConfirmandoReinicio(false)
  }

  return (
    <>
      <section className="encabezado">
        <h1>Mi progreso</h1>
        <p>Así va tu aprendizaje real, {usuarioActual?.primerNombre || 'Estudiante'}.</p>
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
              {resumen.faltan} XP para llegar al nivel {resumen.nivel + 1} · Total: {resumen.xp} XP
            </span>
          </div>
          <BarraProgreso porcentaje={(resumen.xpEnNivel / XP_POR_NIVEL) * 100} />
        </div>
      </div>

      <div className="estadisticas estadisticas-5">
        {estadisticas.map((dato) => (
          <p key={dato.titulo} className="estadistica">
            <strong>{dato.valor}</strong>
            <span>{dato.titulo}</span>
          </p>
        ))}
      </div>

      <section className="seccion">
        <h2>Certificados y porcentaje de aciertos</h2>
        <p className="texto-suave intro">
          Al completar un curso superando su porcentaje mínimo de aciertos se emite tu certificado verificable.
        </p>

        {certificados.length > 0 ? (
          <div className="certificados-grid">
            {certificados.map((cert) => (
              <Link
                key={cert.id}
                to={'/certificado/' + cert.cursoId}
                className="certificado-mini"
                style={{ '--color-linea': cert.cursoColor }}
              >
                <span className="certificado-sello">✪</span>
                <div>
                  <h3>{cert.cursoTitulo}</h3>
                  <p className="texto-suave">
                    {cert.porcentajeAciertos}% aciertos · {cert.emitidoEn}
                  </p>
                  <p className="certificado-codigo-mini">{cert.codigo}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="texto-suave">
            Todavía no tienes certificados emitidos. Completa un curso con al menos 70 % de aciertos para obtener el primero.
          </p>
        )}

        {cursosPorMejorar.length > 0 && (
          <div className="alerta-info" style={{ marginTop: '1rem' }}>
            <strong>Cursos terminados por mejorar para certificado:</strong>{' '}
            {cursosPorMejorar.map((c) => {
              const st = estadisticasPorCurso[String(c.id)]
              return (
                <span key={c.id} style={{ marginRight: '0.75rem' }}>
                  <Link to={'/aula/' + c.id} className="enlace">
                    {c.titulo}
                  </Link>{' '}
                  ({st.porcentajeAciertos}% / mín. {st.umbralCertificado}%)
                </span>
              )
            })}
          </div>
        )}
      </section>

      <section className="seccion">
        <h2>Árbol de habilidades</h2>
        <p className="texto-suave intro">
          Se actualiza automáticamente a medida que avanzas y completas cursos en cada rama.
        </p>

        <div className="arbol">
          {habilidades.map((rama) => (
            <div key={rama.rama} className="rama" style={{ '--color-linea': rama.color }}>
              <h3>
                <span className="rama-color"></span>
                {rama.rama}
              </h3>
              <ol className="ruta ruta-vertical">
                {rama.nodos.map((nodo) => (
                  <li key={nodo.cursoId || nodo.titulo} className={'parada ' + nodo.estado}>
                    <span className="punto"></span>
                    <Link to={'/aula/' + nodo.cursoId} className="parada-titulo enlace-nodo">
                      {nodo.titulo}
                    </Link>
                    <span className="parada-detalle">{nodo.porcentaje}%</span>
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
          <Link to="/logros" className="enlace">Ver todos los logros ({logros.filter((l) => l.desbloqueado).length}/{logros.length})</Link>
        </div>
        {logrosRecientes.length > 0 ? (
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
        ) : (
          <p className="texto-suave">Completa tu primera lección para desbloquear tu primer logro.</p>
        )}
      </section>

      <section className="seccion">
        <h2>Tu avance guardado en el servidor</h2>
        <p className="texto-suave intro">
          Tu progreso, racha, logros y certificados están sincronizados en la base de datos SQLite.
        </p>

        {!confirmandoReinicio ? (
          <button
            type="button"
            className="boton boton-claro"
            onClick={() => setConfirmandoReinicio(true)}
          >
            Reiniciar progreso
          </button>
        ) : (
          <div className="confirmacion-inline" role="alert">
            <span>¿Seguro que deseas reiniciar tu progreso? Volverás al punto de partida.</span>
            <div className="botones">
              <button
                type="button"
                className="boton"
                disabled={reiniciando}
                onClick={confirmarReiniciar}
              >
                {reiniciando ? 'Reiniciando…' : 'Sí, estoy seguro'}
              </button>
              <button
                type="button"
                className="boton boton-claro"
                onClick={() => setConfirmandoReinicio(false)}
              >
                No, cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

export default Progreso
