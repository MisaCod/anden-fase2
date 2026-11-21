import { Link } from 'react-router-dom'
import BarraProgreso from './BarraProgreso.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { cursoEmpezado, cursoTerminado, leccionesDe, porcentajeCurso } from '../logica/progreso.js'

// Mismas reglas que Inicio; no se usa el % porque se redondea hacia abajo
function textoBoton(curso, progreso) {
  if (cursoTerminado(curso, progreso)) return 'Repasar'
  if (cursoEmpezado(curso, progreso)) return 'Continuar'
  return 'Empezar'
}

function FilaCurso({ curso }) {
  const { progreso } = useProgreso()
  const lecciones = leccionesDe(curso)
  const porcentaje = porcentajeCurso(curso, progreso)

  // Duración total del curso en minutos, redondeada hacia arriba
  let segundos = 0
  for (const leccion of lecciones) segundos += leccion.duracion
  const minutos = Math.ceil(segundos / 60)

  return (
    <article className="fila-curso" style={{ '--color-linea': curso.color }}>
      <span className="insignia">{curso.id}</span>

      <div>
        <h3>{curso.titulo}</h3>
        <p className="texto-suave">{curso.descripcion}</p>
        <p className="meta">
          {curso.nivel}, {lecciones.length} lecciones, {minutos} min
        </p>
      </div>

      <div className="fila-curso-progreso">
        <span>{porcentaje}%</span>
        <BarraProgreso porcentaje={porcentaje} />
      </div>

      <Link to={'/aula/' + curso.id} className="boton boton-claro">
        {textoBoton(curso, progreso)}
      </Link>
    </article>
  )
}

export default FilaCurso
