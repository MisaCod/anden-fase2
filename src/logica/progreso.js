// Reglas del progreso. Son funciones puras: reciben los datos por parámetro y devuelven
// un resultado, sin usar React ni leer archivos. Así se pueden probar solas y pasar a Python.

// Todas las lecciones de un curso en un solo arreglo
export function leccionesDe(curso) {
  return curso.modulos.flatMap((modulo) => modulo.lecciones)
}

// Lo que el progreso guarda de una lección. Si todavía no hay nada, empieza en cero
export function avanceDe(progreso, leccionId) {
  return progreso.lecciones[leccionId] || { maximo: 0, completada: false }
}

// Segundos vistos de una lección: si está completada cuenta entera
export function segundosVistos(leccion, progreso) {
  const avance = avanceDe(progreso, leccion.id)
  if (avance.completada) return leccion.duracion
  return Math.min(avance.maximo, leccion.duracion)
}

// La primera lección sin completar del curso (undefined si el curso está terminado)
export function leccionActual(curso, progreso) {
  return leccionesDe(curso).find((leccion) => !avanceDe(progreso, leccion.id).completada)
}

// hecho = completada, actual = la primera sin completar, pendiente = las demás (bloqueadas)
export function estadoLeccion(curso, leccion, progreso) {
  if (avanceDe(progreso, leccion.id).completada) return 'hecho'
  const actual = leccionActual(curso, progreso)
  if (actual && actual.id === leccion.id) return 'actual'
  return 'pendiente'
}

// La lección que sigue a esta dentro del curso (undefined si es la última)
export function siguienteLeccion(curso, leccion) {
  const lecciones = leccionesDe(curso)
  return lecciones[lecciones.indexOf(leccion) + 1]
}

// Porcentaje del curso según los segundos vistos. Se redondea hacia abajo
// para que el 100 % aparezca solo cuando de verdad se terminó
export function porcentajeCurso(curso, progreso) {
  let total = 0
  let visto = 0
  for (const leccion of leccionesDe(curso)) {
    total += leccion.duracion
    visto += segundosVistos(leccion, progreso)
  }
  if (total === 0) return 0
  return Math.floor((visto / total) * 100)
}

// Empezado = alguna lección con segundos vistos
export function cursoEmpezado(curso, progreso) {
  return leccionesDe(curso).some((leccion) => segundosVistos(leccion, progreso) > 0)
}

// Terminado = todas sus lecciones completadas
export function cursoTerminado(curso, progreso) {
  const lecciones = leccionesDe(curso)
  return lecciones.length > 0 && lecciones.every((l) => avanceDe(progreso, l.id).completada)
}

// Hasta qué segundo se puede adelantar: toda la lección si está completada; si no, hasta lo ya visto
export function limiteDeAvance(leccion, progreso) {
  const avance = avanceDe(progreso, leccion.id)
  if (avance.completada) return leccion.duracion
  return avance.maximo
}

// Una pregunta cuenta como respondida si se acertó o si su lección ya está completada
export function preguntaRespondida(pregunta, leccion, progreso) {
  if (avanceDe(progreso, leccion.id).completada) return true
  return Boolean(progreso.respuestas[pregunta.id])
}

// La primera pregunta cuyo segundo ya pasó y que todavía no se respondió
export function preguntaPendiente(leccion, progreso, tiempo) {
  return leccion.cuestionarios.find(
    (pregunta) => pregunta.segundo <= tiempo && !preguntaRespondida(pregunta, leccion, progreso)
  )
}

// La lección que conviene abrir: la última que se vio si no se terminó; si no, la actual
// de ese curso; si ese curso ya terminó, la actual de otro curso empezado. null si no queda nada
export function leccionParaSeguir(cursos, progreso) {
  const ultima = progreso.ultimaLeccion || {}
  const cursoUltimo = cursos.find((c) => c.id === ultima.cursoId)

  if (cursoUltimo) {
    const leccion = leccionesDe(cursoUltimo).find((l) => l.id === ultima.leccionId)
    if (leccion && !avanceDe(progreso, leccion.id).completada) {
      return { curso: cursoUltimo, leccion: leccion }
    }
    const actual = leccionActual(cursoUltimo, progreso)
    if (actual) return { curso: cursoUltimo, leccion: actual }
  }

  const otro = cursos.find((c) => cursoEmpezado(c, progreso) && !cursoTerminado(c, progreso))
  if (otro) return { curso: otro, leccion: leccionActual(otro, progreso) }
  return null
}
