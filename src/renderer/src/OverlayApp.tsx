import { useEffect, useRef, useState } from 'react'
import { Waveform } from './overlay/Waveform'
import {
  BouncingDots,
  DrawnCheck,
  ErrorIcon,
  PulseDot,
  SparkleBurst,
  ThinkingBars,
  WarningTriangle
} from './overlay/StatusIcon'

/**
 * Overlay flotante con animaciones premium (post-Fase 9).
 *
 * Cada estado tiene:
 *   - su propio color de acento (texto + halo + borde)
 *   - su propio icono animado (PulseDot, Waveform, BouncingDots, SparkleBurst, DrawnCheck…)
 *   - entrada con pop-in / fade dependiendo del flujo
 *
 * El pill se redimensiona automáticamente al contenido — no hay width fijo;
 * usamos transition-[width] sobre el contenedor para que el cambio sea suave.
 */

type UiState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'transcribing'
  | 'cleaning'
  | 'pasting'
  | 'pasted-ok'
  | 'pasted-fallback'
  | 'error'

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ]
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m
    }
  }
  return ''
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * Mapea estado → tinte de acento. Usamos OKLCH approximate de Tailwind v4
 * pero pasamos hex directo donde lo necesitamos en canvas.
 */
function accentForState(state: UiState): {
  border: string
  text: string
  glow: string
  waveColor: string
} {
  switch (state) {
    case 'recording':
      return {
        border: 'border-red-500/40',
        text: 'text-red-300',
        glow: 'shadow-[0_0_24px_-2px_rgba(248,113,113,0.5)]',
        waveColor: 'rgb(248 113 113)'
      }
    case 'processing':
      return {
        border: 'border-amber-400/40',
        text: 'text-amber-200',
        glow: 'shadow-[0_0_24px_-2px_rgba(251,191,36,0.45)]',
        waveColor: 'rgb(251 191 36)'
      }
    case 'transcribing':
      return {
        border: 'border-violet-400/40',
        text: 'text-violet-200',
        glow: 'shadow-[0_0_24px_-2px_rgba(167,139,250,0.55)]',
        waveColor: 'rgb(167 139 250)'
      }
    case 'cleaning':
      return {
        border: 'border-fuchsia-400/40',
        text: 'text-fuchsia-200',
        glow: 'shadow-[0_0_24px_-2px_rgba(232,121,249,0.5)]',
        waveColor: 'rgb(232 121 249)'
      }
    case 'pasting':
      return {
        border: 'border-sky-400/40',
        text: 'text-sky-200',
        glow: 'shadow-[0_0_24px_-2px_rgba(125,211,252,0.5)]',
        waveColor: 'rgb(125 211 252)'
      }
    case 'pasted-ok':
      return {
        border: 'border-emerald-400/50',
        text: 'text-emerald-300',
        glow: 'shadow-[0_0_28px_-2px_rgba(52,211,153,0.55)]',
        waveColor: 'rgb(52 211 153)'
      }
    case 'pasted-fallback':
      return {
        border: 'border-yellow-400/50',
        text: 'text-yellow-200',
        glow: 'shadow-[0_0_24px_-2px_rgba(250,204,21,0.45)]',
        waveColor: 'rgb(250 204 21)'
      }
    case 'error':
      return {
        border: 'border-red-400/50',
        text: 'text-red-300',
        glow: 'shadow-[0_0_24px_-2px_rgba(248,113,113,0.5)]',
        waveColor: 'rgb(248 113 113)'
      }
    default:
      return {
        border: 'border-white/10',
        text: 'text-neutral-300',
        glow: 'shadow-2xl',
        waveColor: 'rgb(115 115 115)'
      }
  }
}

export function OverlayApp(): React.JSX.Element {
  const [uiState, setUiState] = useState<UiState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [resultText, setResultText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [pasteReason, setPasteReason] = useState<string | undefined>()
  // Stream separado en state para que React re-renderice Waveform cuando arranca/para.
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeRef = useRef<string>('')

  function clearTimer(): void {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function releaseStream(): void {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActiveStream(null)
  }

  async function beginCapture(): Promise<void> {
    try {
      const mime = pickMimeType()
      if (!mime) {
        window.api.audioError('Ningún codec de audio soportado en este navegador')
        return
      }
      mimeRef.current = mime

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream
      setActiveStream(stream)

      const recorder = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onerror = (e) => {
        window.api.audioError(`MediaRecorder error: ${String(e)}`)
      }
      recorder.onstop = async () => {
        clearTimer()
        releaseStream()
        setUiState('processing')

        try {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current })
          const buffer = await blob.arrayBuffer()
          await window.api.audioReady({ buffer, mimeType: mimeRef.current })
        } catch (err) {
          window.api.audioError(`Fallo enviando audio al main: ${String(err)}`)
        } finally {
          chunksRef.current = []
          recorderRef.current = null
        }
      }

      recorderRef.current = recorder
      recorder.start(250)
      startedAtRef.current = performance.now()
      setUiState('recording')
      setElapsedMs(0)
      setResultText('')
      setErrorMsg('')
      setPasteReason(undefined)
      clearTimer()
      timerRef.current = setInterval(() => {
        setElapsedMs(performance.now() - startedAtRef.current)
      }, 100)
    } catch (err) {
      window.api.audioError(`No se pudo acceder al micrófono: ${String(err)}`)
      setUiState('idle')
    }
  }

  function endCapture(): void {
    const rec = recorderRef.current
    if (!rec) {
      setUiState('idle')
      return
    }
    if (rec.state !== 'inactive') rec.stop()
  }

  useEffect(() => {
    if (!window.api) return

    const offToggle = window.api.onToggleRecording((p) => {
      if (!p.active && uiState === 'recording') endCapture()
    })

    const offStart = window.api.onStartRecording(() => {
      void beginCapture()
    })

    const offStop = window.api.onStopRecording(() => {
      endCapture()
    })

    const offTranscribing = window.api.onTranscribingStarted(() => {
      setUiState('transcribing')
    })

    const offTranscribed = window.api.onTranscribed((payload) => {
      setResultText(payload.text)
    })

    const offCleaning = window.api.onCleaningStarted(() => {
      setUiState('cleaning')
    })

    const offCleaned = window.api.onCleaned(({ text }) => {
      setResultText(text)
    })

    const offError = window.api.onTranscribeError((message) => {
      setErrorMsg(message)
      setUiState('error')
      setElapsedMs(0)
    })

    const offPasting = window.api.onPastingStarted(() => {
      setUiState('pasting')
    })

    const offPasted = window.api.onPasted(({ ok, reason }) => {
      setPasteReason(reason)
      setUiState(ok ? 'pasted-ok' : 'pasted-fallback')
    })

    return () => {
      offToggle()
      offStart()
      offStop()
      offTranscribing()
      offTranscribed()
      offCleaning()
      offCleaned()
      offError()
      offPasting()
      offPasted()
      clearTimer()
      releaseStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accent = accentForState(uiState)
  const recording = uiState === 'recording'
  const showError = uiState === 'error'

  // ─── Render por estado ────────────────────────────────────────────────────
  // Cada estado tiene su propio bloque para que el layout sea óptimo.

  let content: React.JSX.Element
  if (uiState === 'idle') {
    content = (
      <>
        <PulseDot />
        <span className="text-sm font-medium tracking-wide">CleeVoice</span>
      </>
    )
  } else if (recording) {
    content = (
      <>
        <PulseDot active />
        <Waveform stream={activeStream} bars={32} width={180} height={26} color={accent.waveColor} />
        <span className="font-mono text-xs tabular-nums text-neutral-300">
          {formatTime(elapsedMs)}
        </span>
      </>
    )
  } else if (uiState === 'processing') {
    content = (
      <>
        <BouncingDots />
        <span className="text-sm font-medium tracking-wide">Procesando audio</span>
      </>
    )
  } else if (uiState === 'transcribing') {
    content = (
      <>
        <ThinkingBars />
        <span className="text-sm font-medium tracking-wide">Transcribiendo</span>
      </>
    )
  } else if (uiState === 'cleaning') {
    content = (
      <>
        <SparkleBurst />
        <span className="text-sm font-medium tracking-wide">Limpiando con IA</span>
      </>
    )
  } else if (uiState === 'pasting') {
    content = (
      <>
        <BouncingDots />
        <span className="text-sm font-medium tracking-wide">Pegando</span>
      </>
    )
  } else if (uiState === 'pasted-ok') {
    content = (
      <>
        <DrawnCheck />
        <span className="text-sm font-medium tracking-wide">Pegado</span>
      </>
    )
  } else if (uiState === 'pasted-fallback') {
    const tip =
      pasteReason === 'no-accessibility'
        ? 'Activá Accesibilidad · Cmd+V para pegar'
        : 'En portapapeles · Cmd+V para pegar'
    content = (
      <>
        <WarningTriangle />
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-medium uppercase tracking-wider opacity-80">{tip}</span>
          <span className="text-sm text-white/90 line-clamp-1" title={resultText}>
            {resultText || '(sin texto)'}
          </span>
        </div>
      </>
    )
  } else {
    // error
    content = (
      <>
        <ErrorIcon />
        <span className="text-sm font-medium tracking-wide">{errorMsg || 'Error inesperado'}</span>
      </>
    )
  }

  const isWorking =
    uiState === 'processing' ||
    uiState === 'transcribing' ||
    uiState === 'cleaning' ||
    uiState === 'pasting'

  // key={uiState} desmonta/remonta el pill al cambiar — dispara la animación pop-in.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-3">
      <div
        key={uiState}
        className={
          'relative flex items-center gap-3 overflow-hidden rounded-full border bg-neutral-950/80 px-5 py-2.5 backdrop-blur-xl transition-colors duration-200 ' +
          accent.border +
          ' ' +
          accent.text +
          ' ' +
          accent.glow +
          (uiState === 'idle' ? ' opacity-70' : '') +
          (showError ? ' animate-[shake_360ms_cubic-bezier(0.65,0,0.35,1)]' : '')
        }
        style={{
          animation:
            uiState !== 'idle' ? 'pop-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined
        }}
      >
        {/*
         * Shimmer pasivo en estados "trabajando". Una banda diagonal cruza el pill
         * cada 1.6s para que se vea claramente "vivo" sin distraer.
         */}
        {isWorking && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          >
            <span
              className="absolute inset-y-0 -left-1/3 w-1/2 opacity-40"
              style={{
                background: `linear-gradient(90deg, transparent, ${accent.waveColor}55, transparent)`,
                animation: 'shimmer 1.6s linear infinite'
              }}
            />
          </span>
        )}
        <div className="relative z-10 flex items-center gap-3">{content}</div>
      </div>
    </div>
  )
}
