import { useState } from 'react'

function IconoEstrella({ llena, media = false, tamano = 14 }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`estrella-svg ${llena ? 'llena' : media ? 'media' : 'vacia'}`}
    >
      <path
        d="M12 2.25l2.95 6.08 6.7.95-4.86 4.71 1.16 6.67L12 17.5l-5.95 3.16 1.16-6.67L2.35 9.28l6.7-.95L12 2.25z"
        fill={llena ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function EstrellasValoracion({
  valor = null,
  total = null,
  interactiva = false,
  cargando = false,
  mostrarTexto = true,
  tamano = 'sm',
  etiquetaVacia = 'Sin valoraciones',
  alValorar = null,
}) {
  const [hoverValor, setHoverValor] = useState(0)
  const px = tamano === 'md' ? 22 : 14
  const numero = valor !== null && valor !== undefined ? Number(valor) : null
  const activo = interactiva && hoverValor > 0 ? hoverValor : numero || 0

  return (
    <span className={`valoracion-estrellas ${interactiva ? 'interactiva' : ''}`}>
      <span
        className="valoracion-estrellas-fila"
        role={interactiva ? 'group' : 'img'}
        aria-label={
          numero !== null
            ? `Valoración ${numero.toFixed(1)} de 5`
            : etiquetaVacia
        }
        onMouseLeave={() => interactiva && setHoverValor(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const llena = activo >= n - 0.25
          if (interactiva) {
            return (
              <button
                key={n}
                type="button"
                className={`estrella-boton ${llena ? 'llena' : ''}`}
                disabled={cargando}
                onMouseEnter={() => setHoverValor(n)}
                onFocus={() => setHoverValor(n)}
                onBlur={() => setHoverValor(0)}
                onClick={() => alValorar && alValorar(n)}
                aria-label={`Valorar con ${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
                title={`${n} de 5`}
              >
                <IconoEstrella llena={llena} tamano={px} />
              </button>
            )
          }
          return <IconoEstrella key={n} llena={llena} tamano={px} />
        })}
      </span>

      {mostrarTexto && (
        <span className="valoracion-texto">
          {numero !== null && (!total || total > 0) ? (
            <>
              <strong>{numero.toFixed(1)}</strong> / 5
              {total !== null && total !== undefined ? ` (${total})` : ''}
            </>
          ) : (
            <span className="texto-suave">{etiquetaVacia}</span>
          )}
        </span>
      )}
    </span>
  )
}
