import { useMemo, useState } from 'react'
import { useCursos } from '../contextos/CursosContext.jsx'
import FilaCurso from '../components/FilaCurso.jsx'
import ModalAccesoCurso from '../components/ModalAccesoCurso.jsx'

function Cursos() {
  const { cursos, cargandoCursos } = useCursos()
  const [categoria, setCategoria] = useState('Todos')
  const [filtroAcceso, setFiltroAcceso] = useState('todos') // 'todos' | 'gratis' | 'restringido'
  const [cursoModal, setCursoModal] = useState(null)

  const categorias = useMemo(() => {
    const base = ['Todos', 'Programación', 'Diseño', 'Datos']
    const extras = cursos
      .map((c) => c.categoria)
      .filter((cat) => cat && !base.includes(cat))
    return [...base, ...Array.from(new Set(extras))]
  }, [cursos])

  const cursosFiltrados = cursos.filter((curso) => {
    const okCat = categoria === 'Todos' || curso.categoria === categoria
    const okAcc = filtroAcceso === 'todos' || curso.tipoAcceso === filtroAcceso
    return okCat && okAcc
  })

  return (
    <>
      <section className="encabezado">
        <h1>Cursos</h1>
        <p>
          Cada curso es una línea con su color y tema propio. Los cursos gratuitos están abiertos desde el primer día; los restringidos pueden desbloquearse con permiso del profesor o pago simulado.
        </p>
      </section>

      <div className="filtros-barra">
        <div className="filtros" aria-label="Filtrar por categoría">
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

        <div className="filtros filtros-acceso" aria-label="Filtrar por tipo de acceso">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'gratis', label: 'Gratis' },
            { id: 'restringido', label: 'Restringidos' },
          ].map((opt) => (
            <button
              key={opt.id}
              className={filtroAcceso === opt.id ? 'filtro activo' : 'filtro'}
              aria-pressed={filtroAcceso === opt.id}
              onClick={() => setFiltroAcceso(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {cargandoCursos && cursos.length === 0 ? (
        <p className="texto-suave">Cargando catálogo desde el servidor…</p>
      ) : (
        <div className="lista-cursos">
          {cursosFiltrados.map((curso) => (
            <FilaCurso
              key={curso.id}
              curso={curso}
              alSolicitarAcceso={(c) => setCursoModal(c)}
            />
          ))}
        </div>
      )}

      {!cargandoCursos && cursosFiltrados.length === 0 && (
        <p className="mensaje-vacio">No hay cursos que coincidan con los filtros seleccionados.</p>
      )}

      {cursoModal && (
        <ModalAccesoCurso curso={cursoModal} alCerrar={() => setCursoModal(null)} />
      )}
    </>
  )
}

export default Cursos
