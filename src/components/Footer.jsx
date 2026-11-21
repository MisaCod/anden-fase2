import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-contenido">
        <p>andén, proyecto de Programación Web, URBE 2026</p>
        <nav>
          <Link to="/cursos">Cursos</Link>
          <Link to="/progreso">Mi progreso</Link>
          <Link to="/logros">Logros</Link>
        </nav>
      </div>
    </footer>
  )
}

export default Footer
