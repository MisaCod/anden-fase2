import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const CLAVE_SESION = 'anden-sesion'

// Usuarios registrados según los requisitos
const USUARIOS_VALIDOS = [
  {
    username: 'diego',
    password: '1234',
    nombre: 'Diego Cardozo',
    primerNombre: 'Diego',
    iniciales: 'DC',
    rol: 'usuario',
  },
  {
    username: 'admin',
    password: '1234',
    nombre: 'Administrador',
    primerNombre: 'Admin',
    iniciales: 'AD',
    rol: 'admin',
  },
]

function leerSesionGuardada() {
  try {
    const sesion = localStorage.getItem(CLAVE_SESION)
    return sesion ? JSON.parse(sesion) : null
  } catch (error) {
    return null
  }
}

export function AuthProvider({ children }) {
  const [usuarioActual, setUsuarioActual] = useState(leerSesionGuardada)

  useEffect(() => {
    try {
      if (usuarioActual) {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(usuarioActual))
      } else {
        localStorage.removeItem(CLAVE_SESION)
      }
    } catch (error) {
      // Manejo seguro de cuota de localStorage
    }
  }, [usuarioActual])

  function iniciarSesion(username, password) {
    const usuarioLimpio = (username || '').trim().toLowerCase()
    const passwordLimpio = (password || '').trim()

    // Validaciones de datos de entrada
    if (!usuarioLimpio && !passwordLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu usuario y contraseña.' }
    }
    if (!usuarioLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu nombre de usuario.' }
    }
    if (!passwordLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu contraseña.' }
    }

    // Validación contra usuarios del sistema
    const encontrado = USUARIOS_VALIDOS.find(
      (u) => u.username.toLowerCase() === usuarioLimpio && u.password === passwordLimpio
    )

    if (!encontrado) {
      return {
        ok: false,
        error: 'Credenciales inválidas. Usuario o contraseña incorrectos.',
      }
    }

    // Sesión exitosa (sin almacenar la contraseña en memoria activa de sesión)
    const datosSesion = {
      username: encontrado.username,
      nombre: encontrado.nombre,
      primerNombre: encontrado.primerNombre,
      iniciales: encontrado.iniciales,
      rol: encontrado.rol,
    }

    setUsuarioActual(datosSesion)
    return { ok: true, usuario: datosSesion }
  }

  function cerrarSesion() {
    setUsuarioActual(null)
    try {
      localStorage.removeItem(CLAVE_SESION)
    } catch (e) {
      // Ignorar error de almacenamiento
    }
  }

  return (
    <AuthContext.Provider
      value={{
        usuarioActual,
        estaAutenticado: Boolean(usuarioActual),
        esAdmin: usuarioActual?.rol === 'admin',
        iniciarSesion,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider')
  }
  return contexto
}
