import { Link, NavLink, useNavigate } from 'react-router-dom'
import usuario from '../data/usuario.json'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { XP_POR_NIVEL } from '../logica/gamificacion.js'

function Header() {
  // El nivel sale del progreso global: cambia en cuanto ganas XP, en cualquier página
  const { resumen } = useProgreso()
  const { usuarioActual, cerrarSesion, esAdmin } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    cerrarSesion()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="header-contenido">
        <Link to="/" className="logo">
          <span className="logo-punto"></span>
          andén
          {esAdmin && <span className="badge-admin-header">Admin</span>}
        </Link>

        <nav className="nav">
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/cursos">Cursos</NavLink>
          <NavLink to="/aula">Aula</NavLink>
          <NavLink to="/progreso">Mi progreso</NavLink>
          <NavLink to="/logros">Logros</NavLink>
          {esAdmin && (
            <NavLink to="/admin" className="enlace-admin-nav">
              Panel Admin
            </NavLink>
          )}
        </nav>

        <div className="header-usuario-area">
          <Link to="/progreso" className="usuario" title="Ver mi progreso">
            <span className="usuario-nivel">
              Nivel {resumen.nivel}
              <span className="mini-barra">
                <span style={{ width: (resumen.xpEnNivel / XP_POR_NIVEL) * 100 + '%' }}></span>
              </span>
              <span className="sr-only">
                , {resumen.xpEnNivel} de {XP_POR_NIVEL} XP
              </span>
            </span>
            <span className="avatar">
              {usuarioActual?.iniciales || usuario.iniciales}
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="boton-cerrar-sesion"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
