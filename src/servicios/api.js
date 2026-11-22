const CLAVE_TOKEN = 'anden-token'

export function obtenerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token)
    else localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Ignorar error de almacenamiento
  }
}

export async function apiFetch(ruta, opciones = {}) {
  const token = obtenerToken()
  const headers = { ...(opciones.headers || {}) }

  if (!(opciones.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(ruta, {
      ...opciones,
      headers,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor Python (FastAPI). Verifica que el backend esté encendido en el puerto 8000.')
  }

  let data = null
  const tipoContenido = res.headers.get('content-type') || ''
  if (tipoContenido.includes('application/json')) {
    try {
      data = await res.json()
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const detalle =
      (data && (data.detail || data.error || data.mensaje)) ||
      `Error ${res.status} en el servidor.`
    const err = new Error(typeof detalle === 'string' ? detalle : JSON.stringify(detalle))
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export async function subirVideoServidor(archivo) {
  const form = new FormData()
  form.append('file', archivo)
  return apiFetch('/api/videos/upload', {
    method: 'POST',
    body: form,
  })
}
