import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiFetch, guardarToken, obtenerToken } from '../servicios/api.js'

const AuthContext = createContext(null)
const CLAVE_SESION = 'anden-sesion'

function leerSesionGuardada() {
  try {
    const sesion = localStorage.getItem(CLAVE_SESION)
    return sesion ? JSON.parse(sesion) : null
  } catch {
    return null
  }
}

function guardarSesion(usuario) {
  try {
    if (usuario) localStorage.setItem(CLAVE_SESION, JSON.stringify(usuario))
    else localStorage.removeItem(CLAVE_SESION)
  } catch {
    // Ignorar cuota de almacenamiento
  }
}

export function AuthProvider({ children }) {
  const [usuarioActual, setUsuarioActual] = useState(leerSesionGuardada)
  const [cargandoAuth, setCargandoAuth] = useState(() => Boolean(obtenerToken()))

  const cerrarSesion = useCallback(() => {
    guardarToken(null)
    guardarSesion(null)
    setUsuarioActual(null)
  }, [])

  // Validar sesión existente contra FastAPI al arrancar
  useEffect(() => {
    const token = obtenerToken()
    if (!token) {
      setCargandoAuth(false)
      return
    }
    let activo = true
    apiFetch('/api/auth/me')
      .then((res) => {
        if (!activo) return
        if (res?.usuario) {
          setUsuarioActual(res.usuario)
          guardarSesion(res.usuario)
        } else {
          cerrarSesion()
        }
      })
      .catch((err) => {
        if (!activo) return
        if (err.status === 401 || err.status === 403) {
          cerrarSesion()
        }
      })
      .finally(() => {
        if (activo) setCargandoAuth(false)
      })

    return () => {
      activo = false
    }
  }, [cerrarSesion])

  async function iniciarSesion(username, password) {
    const usuarioLimpio = (username || '').trim().toLowerCase()
    const passwordLimpio = (password || '').trim()

    if (!usuarioLimpio && !passwordLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu usuario y contraseña.' }
    }
    if (!usuarioLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu nombre de usuario.' }
    }
    if (!passwordLimpio) {
      return { ok: false, error: 'Por favor, ingresa tu contraseña.' }
    }

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: usuarioLimpio, password: passwordLimpio }),
      })
      guardarToken(res.token)
      guardarSesion(res.usuario)
      setUsuarioActual(res.usuario)
      return { ok: true, usuario: res.usuario }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo iniciar sesión.' }
    }
  }

  async function registrarEstudiante({ nombre, username, email, password }) {
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nombre: (nombre || '').trim(),
          username: (username || '').trim().toLowerCase(),
          email: (email || '').trim() || null,
          password: (password || '').trim(),
        }),
      })
      guardarToken(res.token)
      guardarSesion(res.usuario)
      setUsuarioActual(res.usuario)
      return { ok: true, usuario: res.usuario }
    } catch (err) {
      return { ok: false, error: err.message || 'No se pudo crear la cuenta.' }
    }
  }

  const rol = usuarioActual?.rol || null
  const esAdminGeneral = rol === 'admin_general'
  const esProfesor = rol === 'profesor'
  const esStaff = esAdminGeneral || esProfesor

  return (
    <AuthContext.Provider
      value={{
        usuarioActual,
        cargandoAuth,
        estaAutenticado: Boolean(usuarioActual),
        rol,
        esAdminGeneral,
        esProfesor,
        esStaff,
        esAdmin: esStaff,
        iniciarSesion,
        registrarEstudiante,
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
