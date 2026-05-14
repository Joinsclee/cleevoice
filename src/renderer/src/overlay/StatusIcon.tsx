/**
 * Iconografía animada del overlay — un componente por estado.
 *
 * Reemplaza los emojis estáticos del MVP por SVGs que se animan
 * (shimmer, bounce, drawing, etc.). Color tomado de currentColor
 * para que cada estado le pueda dar su tinte.
 */

/** Tres puntos rebotando en secuencia — usado en processing/transcribing/cleaning. */
export function BouncingDots(): React.JSX.Element {
  return (
    <span className="inline-flex items-end gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          style={{
            animation: 'dot-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.14}s`
          }}
        />
      ))}
    </span>
  )
}

/** Onda "pensando" → tres barras verticales pulsando alturas. Más cinético que dots. */
export function ThinkingBars(): React.JSX.Element {
  return (
    <span className="inline-flex h-3.5 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{
            height: '60%',
            animation: 'dot-bounce 1s ease-in-out infinite',
            animationDelay: `${i * 0.12}s`,
            transformOrigin: 'bottom'
          }}
        />
      ))}
    </span>
  )
}

/**
 * Chispas que se expanden hacia afuera — para "limpiando con IA".
 * 4 estrellitas alrededor del centro, fade-in/out staggered.
 */
export function SparkleBurst(): React.JSX.Element {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center" aria-hidden>
      {[
        { top: '0%', left: '50%', delay: '0s' },
        { top: '50%', left: '100%', delay: '0.2s' },
        { top: '100%', left: '50%', delay: '0.4s' },
        { top: '50%', left: '0%', delay: '0.6s' }
      ].map((pos, i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-current"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, -50%)',
            animation: 'blob 1.6s ease-in-out infinite',
            animationDelay: pos.delay
          }}
        />
      ))}
      <span className="absolute h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  )
}

/** Checkmark dibujado a mano — feedback de éxito (pasted-ok). */
export function DrawnCheck(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="overflow-visible"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path
        d="M4.5 8.2 L7 10.5 L11.5 5.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 14,
          strokeDashoffset: 14,
          animation: 'draw-check 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      />
    </svg>
  )
}

/** Triángulo de warning para fallback de paste. */
export function WarningTriangle(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2 L14.5 13 H1.5 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="8" y1="6.5" x2="8" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** X dentro de un círculo — error. */
export function ErrorIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Punto pulsante con halo — usado en idle/recording cuando no hay waveform aún. */
export function PulseDot({ active = false }: { active?: boolean }): React.JSX.Element {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {active && (
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-current"
          style={{ animation: 'blob 1.4s ease-in-out infinite' }}
        />
      )}
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
    </span>
  )
}
