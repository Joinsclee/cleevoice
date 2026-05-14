import { useEffect, useState } from 'react'

export function App(): React.JSX.Element {
  const [version, setVersion] = useState<string>('0.1.0')

  useEffect(() => {
    if (window.api?.version) setVersion(window.api.version)
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Fondo: gradiente radial sutil con tonos JoinsClee (violeta/azul profundo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(37,99,235,0.14),_transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(rgb(255_255_255)_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <div className="mb-8 flex items-center gap-3 text-sm font-medium text-neutral-400">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          <span className="tracking-wide uppercase">JoinsClee · Dictation Desktop</span>
        </div>

        <h1 className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-5xl font-semibold tracking-tight text-transparent md:text-6xl">
          CleeVoice
        </h1>
        <p className="mt-3 text-lg text-neutral-300 md:text-xl">— Listo para construir</p>

        <p className="mt-8 max-w-lg text-sm leading-relaxed text-neutral-400">
          Una tecla, hablas, aparece texto limpio donde estés escribiendo. Whisper local
          gratis · Groq cloud opcional · Windows + Mac.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-3 text-xs text-neutral-500 sm:grid-cols-4">
          <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
            Fase&nbsp;0
            <div className="mt-0.5 font-medium text-emerald-400">Setup ✓</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
            Fase&nbsp;1
            <div className="mt-0.5 font-medium text-neutral-300">Tray + Hotkey</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
            Fase&nbsp;2
            <div className="mt-0.5 font-medium text-neutral-500">Audio</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
            Fase&nbsp;3
            <div className="mt-0.5 font-medium text-neutral-500">Whisper</div>
          </div>
        </div>

        <footer className="absolute bottom-6 text-[11px] text-neutral-600">
          v{version} · com.joinsclee.cleevoice
        </footer>
      </div>
    </main>
  )
}
