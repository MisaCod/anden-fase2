import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contextos/AuthContext.jsx'

function Login() {
  const { iniciarSesion, registrarEstudiante } = useAuth()
  const navigate = useNavigate()

  const [modo, setModo] = useState('login') // 'login' | 'registro'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')
  const [enviando, setEnviando] = useState(false)

  function cambiarModo(nuevoModo) {
    setModo(nuevoModo)
    setErrores({})
    setErrorGeneral('')
  }

  async function handleSubmitLogin(e) {
    e.preventDefault()
    setErrorGeneral('')

    const nuevosErrores = {}
    if (!username.trim()) nuevosErrores.username = 'El nombre de usuario es obligatorio.'
    if (!password.trim()) nuevosErrores.password = 'La contraseña es obligatoria.'
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores)
      return
    }

    setErrores({})
    setEnviando(true)
    const resultado = await iniciarSesion(username, password)
    setEnviando(false)

    if (!resultado.ok) {
      setErrorGeneral(resultado.error)
      return
    }

    if (resultado.usuario.rol === 'admin_general' || resultado.usuario.rol === 'profesor') {
      navigate('/admin')
    } else {
      navigate('/')
    }
  }

  async function handleSubmitRegistro(e) {
    e.preventDefault()
    setErrorGeneral('')

    const nuevosErrores = {}
    if (!nombre.trim() || nombre.trim().length < 2) {
      nuevosErrores.nombre = 'Ingresa tu nombre completo.'
    }
    if (!username.trim() || username.trim().length < 3) {
      nuevosErrores.username = 'El usuario debe tener al menos 3 caracteres.'
    }
    if (!password.trim() || password.trim().length < 4) {
      nuevosErrores.password = 'La contraseña debe tener al menos 4 caracteres.'
    }
    if (password !== confirmarPassword) {
      nuevosErrores.confirmarPassword = 'Las contraseñas no coinciden.'
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores)
      return
    }

    setErrores({})
    setEnviando(true)
    const resultado = await registrarEstudiante({ nombre, username, email, password })
    setEnviando(false)

    if (!resultado.ok) {
      setErrorGeneral(resultado.error)
      return
    }

    navigate('/')
  }

  function llenarCredenciales(usuarioDemo, passDemo) {
    setModo('login')
    setUsername(usuarioDemo)
    setPassword(passDemo)
    setErrores({})
    setErrorGeneral('')
  }

  return (
    <div className="login-pantalla">
      <div className="login-tarjeta">
        <div className="login-cabecera">
          <div className="logo login-logo">
            <span className="logo-punto"></span>
            andén
          </div>
          <h1>{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta de estudiante'}</h1>
          <p className="texto-suave">
            {modo === 'login'
              ? 'Accede a tu aula virtual con tus credenciales.'
              : 'Regístrate gratis para empezar con los cursos abiertos y llevar tu progreso.'}
          </p>
        </div>

        <div className="login-modo-tabs" role="tablist" aria-label="Acceso o registro">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'login'}
            className={`login-modo-tab ${modo === 'login' ? 'activo' : ''}`}
            onClick={() => cambiarModo('login')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'registro'}
            className={`login-modo-tab ${modo === 'registro' ? 'activo' : ''}`}
            onClick={() => cambiarModo('registro')}
          >
            Crear cuenta
          </button>
        </div>

        {errorGeneral && (
          <div className="alerta-error" role="alert">
            <span>{errorGeneral}</span>
          </div>
        )}

        {modo === 'login' ? (
          <form onSubmit={handleSubmitLogin} className="login-formulario" noValidate>
            <div className="campo-grupo">
              <label htmlFor="login-username" className="campo-etiqueta">
                Usuario
              </label>
              <input
                id="login-username"
                type="text"
                className={`campo-input ${errores.username ? 'con-error' : ''}`}
                placeholder="Ej: diego, profe o admin"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (errores.username) setErrores((prev) => ({ ...prev, username: '' }))
                  if (errorGeneral) setErrorGeneral('')
                }}
                autoComplete="username"
                autoFocus
              />
              {errores.username && <span className="campo-mensaje-error">{errores.username}</span>}
            </div>

            <div className="campo-grupo">
              <label htmlFor="login-password" className="campo-etiqueta">
                Contraseña
              </label>
              <div className="campo-password-contenedor">
                <input
                  id="login-password"
                  type={mostrarPassword ? 'text' : 'password'}
                  className={`campo-input ${errores.password ? 'con-error' : ''}`}
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errores.password) setErrores((prev) => ({ ...prev, password: '' }))
                    if (errorGeneral) setErrorGeneral('')
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="boton-ver-pass"
                  onClick={() => setMostrarPassword((prev) => !prev)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {mostrarPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              {errores.password && <span className="campo-mensaje-error">{errores.password}</span>}
            </div>

            <button type="submit" className="boton boton-completo" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar a la plataforma'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitRegistro} className="login-formulario" noValidate>
            <div className="campo-grupo">
              <label htmlFor="reg-nombre" className="campo-etiqueta">
                Nombre completo *
              </label>
              <input
                id="reg-nombre"
                type="text"
                className={`campo-input ${errores.nombre ? 'con-error' : ''}`}
                placeholder="Ej: María Pérez"
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value)
                  if (errores.nombre) setErrores((prev) => ({ ...prev, nombre: '' }))
                }}
                autoFocus
              />
              {errores.nombre && <span className="campo-mensaje-error">{errores.nombre}</span>}
            </div>

            <div className="campo-grupo">
              <label htmlFor="reg-username" className="campo-etiqueta">
                Nombre de usuario *
              </label>
              <input
                id="reg-username"
                type="text"
                className={`campo-input ${errores.username ? 'con-error' : ''}`}
                placeholder="Ej: mariaperez"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (errores.username) setErrores((prev) => ({ ...prev, username: '' }))
                }}
                autoComplete="username"
              />
              {errores.username && <span className="campo-mensaje-error">{errores.username}</span>}
            </div>

            <div className="campo-grupo">
              <label htmlFor="reg-email" className="campo-etiqueta">
                Correo electrónico (opcional)
              </label>
              <input
                id="reg-email"
                type="email"
                className="campo-input"
                placeholder="Ej: maria@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="campo-grupo">
              <label htmlFor="reg-password" className="campo-etiqueta">
                Contraseña *
              </label>
              <input
                id="reg-password"
                type={mostrarPassword ? 'text' : 'password'}
                className={`campo-input ${errores.password ? 'con-error' : ''}`}
                placeholder="Mínimo 4 caracteres"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (errores.password) setErrores((prev) => ({ ...prev, password: '' }))
                }}
                autoComplete="new-password"
              />
              {errores.password && <span className="campo-mensaje-error">{errores.password}</span>}
            </div>

            <div className="campo-grupo">
              <label htmlFor="reg-password2" className="campo-etiqueta">
                Confirmar contraseña *
              </label>
              <input
                id="reg-password2"
                type={mostrarPassword ? 'text' : 'password'}
                className={`campo-input ${errores.confirmarPassword ? 'con-error' : ''}`}
                placeholder="Repite tu contraseña"
                value={confirmarPassword}
                onChange={(e) => {
                  setConfirmarPassword(e.target.value)
                  if (errores.confirmarPassword) {
                    setErrores((prev) => ({ ...prev, confirmarPassword: '' }))
                  }
                }}
                autoComplete="new-password"
              />
              {errores.confirmarPassword && (
                <span className="campo-mensaje-error">{errores.confirmarPassword}</span>
              )}
            </div>

            <p className="texto-suave login-nota-rol">
              Las cuentas registradas aquí son de <strong>Estudiante</strong>. Las cuentas de Profesor o Administrador solo las crea el Administrador general.
            </p>

            <button type="submit" className="boton boton-completo" disabled={enviando}>
              {enviando ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
            </button>
          </form>
        )}

        <div className="login-demos">
          <p className="texto-suave">Accesos de demostración (clave: 1234):</p>
          <div className="login-demos-botones">
            <button
              type="button"
              className="boton-demo"
              onClick={() => llenarCredenciales('diego', '1234')}
            >
              <strong>Estudiante</strong>
              <span>diego / 1234</span>
            </button>
            <button
              type="button"
              className="boton-demo"
              onClick={() => llenarCredenciales('profe', '1234')}
            >
              <strong>Profesor</strong>
              <span>profe / 1234</span>
            </button>
            <button
              type="button"
              className="boton-demo"
              onClick={() => llenarCredenciales('admin', '1234')}
            >
              <strong>Admin general</strong>
              <span>admin / 1234</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
