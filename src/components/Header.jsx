import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useProgreso } from '../contextos/ProgresoContext.jsx'
import { XP_POR_NIVEL } from '../logica/gamificacion.js'

function etiquetaRol(rol) {
  if (rol === 'admin_general') return 'Admin General'
  if (rol === 'profesor') return 'Profesor'
  return ''
}

function Header() {
  const { resumen } = useProgreso()
  const { usuarioActual, cerrarSesion, esStaff, esAdminGeneral } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    cerrarSesion()
    navigate('/')
  }

  const badgeRol = etiquetaRol(usuarioActual?.rol)

  return (
    <header className="header">
      <div className="header-contenido">
        <Link to="/" className="logo">
          <span className="logo-punto"></span>
          andén
          {badgeRol && <span className="badge-admin-header">{badgeRol}</span>}
        </Link>

        <nav className="nav">
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/cursos">Cursos</NavLink>
          <NavLink to="/aula">Aula</NavLink>
          <NavLink to="/progreso">Mi progreso</NavLink>
          <NavLink to="/logros">Logros</NavLink>
          {esStaff && (
            <NavLink to="/admin" className="enlace-admin-nav">
              {esAdminGeneral ? 'Panel Admin' : 'Panel Profesor'}
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
            </span>
            <span className="avatar" title={usuarioActual?.nombre || 'Estudiante'}>
              {usuarioActual?.iniciales || 'US'}
            </span>
          </Link>

          <button
            type="button"
            className="boton-cerrar-sesion"
            onClick={handleLogout}
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
