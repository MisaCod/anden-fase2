# andén, fase 2: funciona el núcleo

Segunda fase del Portal de E-Learning. El aula es el corazón del portal: un reproductor propio sobre un `<video>` real se detiene en cada pregunta, no deja seguir sin acertar ni adelantar lo que no se ha visto. El progreso (XP, nivel, segundos vistos y lecciones) es uno solo para toda la app, se ve al instante en todas las páginas y sobrevive a una recarga.

## Cómo correrlo

```bash
npm install
npm run dev
```

Se abre en http://localhost:5182 (la fase 1 usa el 5181; cada puerto guarda su propio avance).

## Qué funciona

| Dónde | Qué puedes hacer |
| --- | --- |
| Aula | Reproductor propio: botón ▶/❚❚, línea de tiempo con las marcas de cada pregunta y contador |
| Aula | El video se detiene solo en el segundo de cada pregunta y la pregunta aparece debajo, dentro del reproductor. Hasta acertar no se puede seguir: el botón y la línea se bloquean, y si se intenta reproducir desde el menú del navegador se vuelve a pausar |
| Aula | Solo se puede adelantar hasta lo ya visto (tramo claro de la línea). Hacia atrás siempre se puede |
| Aula | Al volver a una lección sigue desde donde quedaste ("Continúas desde 0:18") |
| Aula | Al terminar el video: "Lección completada +50 XP" y se desbloquea la siguiente. Al terminar un curso, +150 XP más |
| Aula | Las lecciones se abren en orden: una lección bloqueada muestra a cuál volver |
| Header | El nivel y su barrita cambian en el momento en que ganas XP |
| Inicio | "Te quedaste en…" muestra la lección real y cuánto falta; la línea y los porcentajes salen del progreso |
| Cursos | Los 6 cursos tienen contenido: 39 lecciones con video y 102 preguntas |
| Mi progreso | Nivel, XP, lecciones completadas, preguntas acertadas y minutos reales; botón Reiniciar progreso |
| Todo | Al recargar (F5) nada se pierde: el progreso se guarda en este equipo |

## Reglas del juego

- +20 XP por acertar al primer intento, +5 si se acierta después. Si fallas, la opción se tacha y vuelves a intentar.
- +50 XP por lección completada (una sola vez) y +150 XP extra al terminar un curso.
- Nivel = XP / 300, redondeado hacia abajo, más 1. Con la semilla (2340 XP) eres nivel 8; al terminar "Componentes y JSX" pasas al 9.
- Una lección se completa cuando el video llega al final con todas sus preguntas acertadas. Repasar no vuelve a preguntar ni suma XP.

## Guion para mostrarlo (4 minutos)

0. Si ya lo probaste en este navegador: Mi progreso → "Reiniciar progreso" → Aceptar. Así vuelves al punto de partida (nivel 8, "Componentes y JSX" en 0:18).
1. Inicio: "Componentes y JSX, te falta 0:42". "Seguir la lección": dice "Continúas desde 0:18".
2. A los 0:20 el video se detiene solo y la pregunta aparece debajo. El botón ▶ no hace nada. Elegir "Un archivo CSS" (se tacha) y luego "Elementos JSX": suma 5 XP por acertar al segundo intento.
3. "Continuar". Intentar arrastrar la línea hacia adelante: no pasa de lo ya visto.
4. Pregunta de 0:45 y final del video: "Lección completada +50 XP". En el header pasa a Nivel 9 y la barrita vuelve a empezar; en el temario se desbloquea "Props: pasar datos".
5. Escribir `/aula/1/105`: "Lección bloqueada".
6. F5: todo sigue igual. Mi progreso → Reiniciar progreso.

## Conceptos nuevos y dónde están

| Concepto | Archivo | Cómo explicarlo |
| --- | --- | --- |
| Context (`createContext`, `Provider`, `useContext`) y el hook propio `useProgreso` | `contextos/ProgresoContext.jsx`, `App.jsx` | Datos que ven todas las páginas, como `$_SESSION` en PHP. `useProgreso()` es un atajo a `useContext(ProgresoContext)`: cualquier componente pide el progreso y las acciones en una línea. Empieza con `use` porque por dentro llama a un hook, y React solo deja llamar hooks dentro de componentes o de funciones que empiezan con `use` |
| `<Navigate replace>` | `pages/Aula.jsx` | Como `header('Location')` en PHP: `/aula` y `/aula/1` pasan a la dirección completa de la lección, así no cambia sola al completarla |
| `localStorage` + `JSON.stringify` / `JSON.parse` | `contextos/ProgresoContext.jsx` | Una sesión que queda guardada en el equipo. El `try/catch` es como el de PDO |
| `useEffect` | `contextos/ProgresoContext.jsx` | "Después de dibujar, si cambió el progreso, guárdalo" |
| `useState` con función inicial | `contextos/ProgresoContext.jsx` | `useState(leerGuardado)` lee lo guardado solo la primera vez |
| `setProgreso((anterior) => …)` y `structuredClone` | `contextos/ProgresoContext.jsx` | Se copia el progreso, se cambia la copia y se devuelve: el estado nunca se modifica directamente |
| `useRef` | `components/Reproductor.jsx` | Guarda el `<video>` real, como `document.getElementById` |
| API de medios del navegador | `components/Reproductor.jsx` | `play()`, `pause()`, `currentTime`, `duration` y los eventos `onLoadedMetadata`, `onTimeUpdate`, `onPlay`, `onPause`, `onSeeking`, `onEnded` |
| `<input type="range">` controlado | `components/Reproductor.jsx` | La línea de tiempo: se arrastra con el mouse y se mueve con las flechas |
| La prop `key` para reiniciar | `pages/Aula.jsx` | `key={leccion.id}`: al cambiar de lección el reproductor empieza de cero |
| Funciones puras | `logica/progreso.js`, `logica/gamificacion.js` | Reciben datos y devuelven un resultado, como funciones de PHP. Nada se guarda dos veces: estados, porcentajes y nivel se calculan |

## Lo que todavía no hace

- Los datos se importan directamente del JSON; todavía no "llegan de un servidor". **Fase 3.**
- Los logros, el árbol de habilidades y los días seguidos siguen fijos en `usuario.json`. **Fase 3.**
- No hay avisos en vivo, ni modo sin conexión, ni velocidad, volumen o pantalla completa en el reproductor. **Fase 3.**
