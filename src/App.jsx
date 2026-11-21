import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contextos/AuthContext.jsx'
import { CursosProvider } from './contextos/CursosContext.jsx'
import { ProgresoProvider } from './contextos/ProgresoContext.jsx'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Inicio from './pages/Inicio.jsx'
import Cursos from './pages/Cursos.jsx'
import Aula from './pages/Aula.jsx'
import Progreso from './pages/Progreso.jsx'
import Logros from './pages/Logros.jsx'
import Login from './pages/Login.jsx'
import Admin from './pages/Admin.jsx'

// Contenedor para las páginas que usan el Header y Footer originales
function VistaEstudiante({ children }) {
  return (
    <>
      <Header />
      <main className="contenedor">{children}</main>
      <Footer />
    </>
  )
}

function ContenidoApp() {
  const { estaAutenticado, esAdmin } = useAuth()

  // 1. Si no ha iniciado sesión, se muestra primero el menú de inicio de sesión
  if (!estaAutenticado) {
    return <Login />
  }

  // 2. Si ha iniciado sesión, se muestra la interfaz debida según el nivel de acceso
  return (
    <Routes>
      {esAdmin ? (
        // Rutas del Administrador
        <>
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<Admin />} />
          {/* Permite al admin inspeccionar la vista de estudiante si lo desea */}
          <Route
            path="/cursos"
            element={
              <VistaEstudiante>
                <Cursos />
              </VistaEstudiante>
            }
          />
          <Route
            path="/aula/:cursoId?/:leccionId?"
            element={
              <VistaEstudiante>
                <Aula />
              </VistaEstudiante>
            }
          />
          <Route
            path="/progreso"
            element={
              <VistaEstudiante>
                <Progreso />
              </VistaEstudiante>
            }
          />
          <Route
            path="/logros"
            element={
              <VistaEstudiante>
                <Logros />
              </VistaEstudiante>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        // Rutas del usuario Diego (u otro estudiante): interfaz existente
        <>
          <Route
            path="/"
            element={
              <VistaEstudiante>
                <Inicio />
              </VistaEstudiante>
            }
          />
          <Route
            path="/cursos"
            element={
              <VistaEstudiante>
                <Cursos />
              </VistaEstudiante>
            }
          />
          <Route
            path="/aula/:cursoId?/:leccionId?"
            element={
              <VistaEstudiante>
                <Aula />
              </VistaEstudiante>
            }
          />
          <Route
            path="/progreso"
            element={
              <VistaEstudiante>
                <Progreso />
              </VistaEstudiante>
            }
          />
          <Route
            path="/logros"
            element={
              <VistaEstudiante>
                <Logros />
              </VistaEstudiante>
            }
          />
          {/* Si Diego intenta acceder a la ruta de admin, se redirige al inicio */}
          <Route path="/admin" element={<Navigate to="/" replace />} />
          {/* Cualquier otra dirección desconocida */}
          <Route
            path="*"
            element={
              <VistaEstudiante>
                <section className="encabezado">
                  <h1>Página no encontrada</h1>
                  <p>
                    Revisa la dirección o vuelve al{' '}
                    <Link to="/" className="enlace">
                      inicio
                    </Link>
                    .
                  </p>
                </section>
              </VistaEstudiante>
            }
          />
        </>
      )}
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CursosProvider>
          {/* ProgresoProvider puede leer y cambiar el progreso de los cursos */}
          <ProgresoProvider>
            <ContenidoApp />
          </ProgresoProvider>
        </CursosProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
