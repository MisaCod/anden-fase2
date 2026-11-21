import { useState, useMemo } from 'react'
import { useCursos } from '../contextos/CursosContext.jsx'
import FilaCurso from '../components/FilaCurso.jsx'

function Cursos() {
  const { cursos } = useCursos()
  // Categoría elegida en los filtros. Al cambiarla, React vuelve a dibujar la lista
  const [categoria, setCategoria] = useState('Todos')

  // Obtener categorías dinámicas más las predeterminadas
  const categorias = useMemo(() => {
    const base = ['Todos', 'Programación', 'Diseño', 'Datos']
    const extras = cursos
      .map((c) => c.categoria)
      .filter((cat) => cat && !base.includes(cat))
    return [...base, ...Array.from(new Set(extras))]
  }, [cursos])

  const cursosFiltrados = cursos.filter(
    (curso) => categoria === 'Todos' || curso.categoria === categoria
  )

  return (
    <>
      <section className="encabezado">
        <h1>Cursos</h1>
        <p>Cada curso es una línea con su color. Cada punto de la línea es una lección.</p>
      </section>

      <div className="filtros">
        {categorias.map((c) => (
          <button
            key={c}
            className={c === categoria ? 'filtro activo' : 'filtro'}
            aria-pressed={c === categoria}
            onClick={() => setCategoria(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="lista-cursos">
        {cursosFiltrados.map((curso) => (
          <FilaCurso key={curso.id} curso={curso} />
        ))}
      </div>

      {cursosFiltrados.length === 0 && (
        <p className="mensaje-vacio">No hay cursos en esta categoría.</p>
      )}
    </>
  )
}

export default Cursos
