import { useEffect, useState } from 'react'

/**
 * Overlay flotante "🎤 Escuchando".
 *
 * Fase 1: escucha el canal `toggle-recording` del main y muestra/oculta el
 * contenido en consonancia. La visibilidad de la ventana en sí la controla
 * el main (main/overlay-window.ts:showOverlay/hideOverlay); aquí sólo
 * decidimos qué pintar dentro.
 *
 * Fase 2 cambiará el copy a "🎤 Grabando…" con timer y "⚙️ Procesando…" al parar.
 */
export function OverlayApp(): React.JSX.Element {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!window.api?.onToggleRecording) return
    const unsubscribe = window.api.onToggleRecording((payload) => {
      setActive(payload.active)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <div
        className={
          'flex items-center gap-3 rounded-2xl border px-5 py-3 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 ' +
          (active
            ? 'scale-100 border-white/15 bg-neutral-900/85 opacity-100'
            : 'scale-95 border-white/10 bg-neutral-900/70 opacity-80')
        }
      >
        <span className="relative inline-flex h-2.5 w-2.5">
          {active && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          )}
          <span
            className={
              'relative inline-flex h-2.5 w-2.5 rounded-full ' +
              (active ? 'bg-red-500' : 'bg-neutral-500')
            }
          />
        </span>
        <span className="text-sm font-medium tracking-wide">
          {active ? '🎤 Escuchando…' : 'CleeVoice'}
        </span>
      </div>
    </div>
  )
}
