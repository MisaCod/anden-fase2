// Convierte segundos a minutos:segundos (ej. 262 -> "4:22").
// Math.floor quita los decimales, porque el video entrega tiempos como 42.7
export function formatoTiempo(segundos) {
  const total = Math.floor(segundos)
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return minutos + ':' + String(resto).padStart(2, '0')
}
