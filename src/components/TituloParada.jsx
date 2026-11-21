import { Link } from 'react-router-dom'

// El nombre de una parada de la línea de metro.
// Si la lección está bloqueada (pendiente) no es enlace; si está abierta en el aula se marca
function TituloParada({ cursoId, leccion, estado, abierta }) {
  if (estado === 'pendiente') {
    return (
      <span className="parada-titulo" aria-disabled="true">
        {leccion.titulo}
        <span className="sr-only"> (bloqueada)</span>
      </span>
    )
  }

  return (
    <Link
      to={'/aula/' + cursoId + '/' + leccion.id}
      className="parada-titulo"
      aria-current={abierta ? 'step' : undefined}
    >
      {leccion.titulo}
      {estado === 'hecho' && <span className="sr-only"> (completada)</span>}
    </Link>
  )
}

export default TituloParada
