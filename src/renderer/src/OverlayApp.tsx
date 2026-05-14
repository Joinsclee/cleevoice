/**
 * Overlay flotante "🎤 escuchando".
 * En Fase 0 lo dejamos preparado pero la ventana del overlay no se mostrará todavía.
 * Fase 1 lo cableará al evento `toggle-recording` desde el main.
 */
export function OverlayApp(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 px-5 py-3 text-white shadow-2xl backdrop-blur-xl">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <span className="text-sm font-medium tracking-wide">🎤 Escuchando…</span>
      </div>
    </div>
  )
}
