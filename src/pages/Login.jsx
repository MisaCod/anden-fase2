import { useState } from 'react'
import { useAuth } from '../contextos/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'

function Login() {
  const { iniciarSesion } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState('')

  function validarCampos() {
    const nuevosErrores = {}
    if (!username.trim()) {
      nuevosErrores.username = 'El nombre de usuario es obligatorio.'
    }
    if (!password.trim()) {
      nuevosErrores.password = 'La contraseña es obligatoria.'
    }
    return nuevosErrores
  }

  function handleSubmit(e) {
    e.preventDefault()
    setErrorGeneral('')

    const erroresValidacion = validarCampos()
    if (Object.keys(erroresValidacion).length > 0) {
      setErrores(erroresValidacion)
      return
    }

    setErrores({})

    const resultado = iniciarSesion(username, password)
    if (!resultado.ok) {
      setErrorGeneral(resultado.error)
      return
    }

    // Redirección según rol
    if (resultado.usuario.rol === 'admin') {
      navigate('/admin')
    } else {
      navigate('/')
    }
  }

  // Atajos para pruebas rápidas
  function llenarCredenciales(usuarioDemo, passDemo) {
    setUsername(usuarioDemo)
    setPassword(passDemo)
    setErrores({})
    setErrorGeneral('')
  }

  return (
    <div className="login-pantalla">
      <div className="login-tarjeta">
        <div className="login-encabezado">
          <div className="login-logo">
            <span className="logo-punto"></span>
            <span className="logo-texto">andén</span>
          </div>
          <h1>Iniciar sesión</h1>
          <p className="texto-suave">
            Ingresa tus credenciales para acceder a la estación de aprendizaje
          </p>
        </div>

        {errorGeneral && (
          <div className="alerta-error" role="alert">
            <span>{errorGeneral}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="formulario-login" noValidate>
          <div className="campo-grupo">
            <label htmlFor="login-username" className="campo-etiqueta">
              Nombre de usuario
            </label>
            <input
              id="login-username"
              type="text"
              className={`campo-input ${errores.username ? 'con-error' : ''}`}
              placeholder="Ej: diego o admin"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (errores.username) setErrores((prev) => ({ ...prev, username: '' }))
                if (errorGeneral) setErrorGeneral('')
              }}
              autoComplete="username"
              autoFocus
            />
            {errores.username && (
              <span className="campo-mensaje-error">{errores.username}</span>
            )}
          </div>

          <div className="campo-grupo">
            <label htmlFor="login-password" className="campo-etiqueta">
              Contraseña
            </label>
            <div className="input-con-boton">
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
                className="boton-toggle-password"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {errores.password && (
              <span className="campo-mensaje-error">{errores.password}</span>
            )}
          </div>

          <button type="submit" className="boton boton-login">
            Ingresar al sistema
          </button>
        </form>

        <div className="login-cuentas-demo">
          <p className="demo-titulo">Cuentas configuradas para acceso:</p>
          <div className="demo-botones">
            <button
              type="button"
              className="demo-chip"
              onClick={() => llenarCredenciales('diego', '1234')}
            >
              <span className="demo-rol">Estudiante</span>
              <strong>diego</strong> / 1234
            </button>

            <button
              type="button"
              className="demo-chip demo-chip-admin"
              onClick={() => llenarCredenciales('admin', '1234')}
            >
              <span className="demo-rol rol-admin">Admin</span>
              <strong>admin</strong> / 1234
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
