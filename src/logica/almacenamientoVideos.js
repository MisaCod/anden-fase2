// Almacenamiento local de videos con IndexedDB
// Permite guardar archivos de video reales sin límites de localStorage y reproducirlos en la app.

const NOMBRE_DB = 'anden_multimedia_db'
const VERSION_DB = 1
const ALMACEN_VIDEOS = 'videos'

function abrirBD() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no está soportado en este entorno.'))
      return
    }

    const peticion = window.indexedDB.open(NOMBRE_DB, VERSION_DB)

    peticion.onupgradeneeded = (evento) => {
      const db = evento.target.result
      if (!db.objectStoreNames.contains(ALMACEN_VIDEOS)) {
        db.createObjectStore(ALMACEN_VIDEOS, { keyPath: 'id' })
      }
    }

    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

// Guarda un archivo Blob/File de video en IndexedDB
export async function guardarVideoBlob(clave, archivo, metadata = {}) {
  const db = await abrirBD()
  return new Promise((resolve, reject) => {
    const transaccion = db.transaction(ALMACEN_VIDEOS, 'readwrite')
    const almacen = transaccion.objectStore(ALMACEN_VIDEOS)

    const registro = {
      id: clave,
      archivo: archivo,
      nombre: metadata.nombre || archivo.name || 'video.mp4',
      tamano: metadata.tamano || archivo.size || 0,
      tipo: metadata.tipo || archivo.type || 'video/mp4',
      duracion: metadata.duracion || 0,
      fechaCreacion: new Date().toISOString(),
    }

    const peticion = almacen.put(registro)
    peticion.onsuccess = () => resolve(registro)
    peticion.onerror = () => reject(peticion.error)
  })
}

// Obtiene el registro de video por ID
export async function obtenerVideoRegistro(clave) {
  try {
    const db = await abrirBD()
    return new Promise((resolve) => {
      const transaccion = db.transaction(ALMACEN_VIDEOS, 'readonly')
      const almacen = transaccion.objectStore(ALMACEN_VIDEOS)
      const peticion = almacen.get(clave)

      peticion.onsuccess = () => resolve(peticion.result || null)
      peticion.onerror = () => resolve(null)
    })
  } catch (error) {
    return null
  }
}

// Obtiene la URL reproducible para un video (Blob URL si está en IndexedDB o URL directa si es estático)
export async function obtenerVideoUrl(referenciaVideo) {
  if (!referenciaVideo) return '/videos/101.mp4'

  // Si es una ruta estándar de la app o enlace web, se retorna directamente
  if (
    referenciaVideo.startsWith('/') ||
    referenciaVideo.startsWith('http://') ||
    referenciaVideo.startsWith('https://') ||
    referenciaVideo.startsWith('blob:')
  ) {
    return referenciaVideo
  }

  // Si es una referencia a IndexedDB (formato 'idb:clave')
  if (referenciaVideo.startsWith('idb:')) {
    const clave = referenciaVideo.replace('idb:', '')
    const registro = await obtenerVideoRegistro(clave)
    if (registro && registro.archivo) {
      return URL.createObjectURL(registro.archivo)
    }
  }

  return referenciaVideo
}

// Obtiene la lista de todos los videos subidos por el usuario
export async function listarVideosSubidos() {
  try {
    const db = await abrirBD()
    return new Promise((resolve) => {
      const transaccion = db.transaction(ALMACEN_VIDEOS, 'readonly')
      const almacen = transaccion.objectStore(ALMACEN_VIDEOS)
      const peticion = almacen.getAll()

      peticion.onsuccess = () => resolve(peticion.result || [])
      peticion.onerror = () => resolve([])
    })
  } catch (error) {
    return []
  }
}

// Elimina un video de IndexedDB
export async function eliminarVideoBlob(clave) {
  try {
    const db = await abrirBD()
    return new Promise((resolve, reject) => {
      const transaccion = db.transaction(ALMACEN_VIDEOS, 'readwrite')
      const almacen = transaccion.objectStore(ALMACEN_VIDEOS)
      const peticion = almacen.delete(clave)

      peticion.onsuccess = () => resolve(true)
      peticion.onerror = () => reject(peticion.error)
    })
  } catch (error) {
    return false
  }
}
