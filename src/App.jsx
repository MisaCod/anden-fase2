import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contextos/AuthContext.jsx'
import { CursosProvider } from './contextos/CursosContext.jsx'
import { ProgresoProvider } from './contextos/ProgresoContext.jsx'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import Admin from './pages/Admin.jsx'
import Aula from './pages/Aula.jsx'
import Certificado from './pages/Certificado.jsx'
import Cursos from './pages/Cursos.jsx'
import Inicio from './pages/Inicio.jsx'
import Login from './pages/Login.jsx'
import Logros from './pages/Logros.jsx'
import Progreso from './pages/Progreso.jsx'

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
  const { estaAutenticado, esStaff, cargandoAuth } = useAuth()

  if (cargandoAuth) {
    return (
      <div className="login-pantalla">
        <p className="texto-suave">Verificando sesión…</p>
      </div>
    )
  }

  if (!estaAutenticado) {
    return <Login />
  }

  return (
    <Routes>
      {esStaff ? (
        <>
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<Admin />} />
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
          <Route
            path="/certificado/:cursoId"
            element={
              <VistaEstudiante>
                <Certificado />
              </VistaEstudiante>
            }
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
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
          <Route
            path="/certificado/:cursoId"
            element={
              <VistaEstudiante>
                <Certificado />
              </VistaEstudiante>
            }
          />
          <Route path="/admin" element={<Navigate to="/" replace />} />
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
          <ProgresoProvider>
            <ContenidoApp />
          </ProgresoProvider>
        </CursosProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
