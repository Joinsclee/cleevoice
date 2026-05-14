import { useEffect, useRef } from 'react'

interface Props {
  /** El MediaStream del MediaRecorder. Null = no hay audio activo. */
  stream: MediaStream | null
  /** Cantidad de barras a dibujar. 28-36 se ve "lleno" sin ser ruidoso. */
  bars?: number
  /** Ancho del componente en px. */
  width?: number
  /** Alto en px. */
  height?: number
  /** Color de las barras (hex o tailwind-token). Default rojo activo. */
  color?: string
}

/**
 * Waveform real-time del micrófono.
 *
 * Conectamos el stream del MediaRecorder a un AnalyserNode y leemos
 * el time-domain por frame; cada barra muestra el RMS de un bucket.
 *
 * El cálculo + redibujado corre en requestAnimationFrame; al desmontar o
 * al cambiar el stream a null, cerramos el AudioContext para no leakear.
 */
export function Waveform({
  stream,
  bars = 32,
  width = 180,
  height = 32,
  color = 'rgb(248 113 113)' // red-400
}: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  // Smoothing entre frames para que las barras no salten bruscamente.
  const lastHeightsRef = useRef<number[]>([])

  useEffect(() => {
    if (!stream) {
      // Limpieza si nos quitan el stream (final de grabación).
      cleanup()
      drawIdle()
      return
    }

    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.4
    analyserRef.current = analyser

    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    sourceRef.current = source

    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    lastHeightsRef.current = new Array(bars).fill(0.05)

    const tick = (): void => {
      draw()
      animationRef.current = requestAnimationFrame(tick)
    }
    tick()

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, bars])

  function cleanup(): void {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    sourceRef.current?.disconnect()
    sourceRef.current = null
    analyserRef.current = null
    audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    dataRef.current = null
  }

  function drawIdle(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    ctx2d.clearRect(0, 0, canvas.width, canvas.height)
  }

  function draw(): void {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    const data = dataRef.current
    if (!canvas || !analyser || !data) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    analyser.getByteTimeDomainData(data)

    // Dividimos las muestras en `bars` buckets y calculamos RMS por bucket.
    const bucketSize = Math.floor(data.length / bars)
    const heights = lastHeightsRef.current

    for (let i = 0; i < bars; i++) {
      let sum = 0
      for (let j = 0; j < bucketSize; j++) {
        const v = (data[i * bucketSize + j]! - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / bucketSize)
      // Boost no-lineal para que la voz hablada tenga presencia visual.
      const boosted = Math.min(1, Math.pow(rms * 3.2, 0.85))
      // Smoothing exponencial → barras suaves.
      const prev = heights[i] ?? 0.05
      heights[i] = prev * 0.55 + boosted * 0.45
    }

    // Clear + redraw.
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== width * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx2d.scale(dpr, dpr)
    }
    ctx2d.clearRect(0, 0, width, height)

    const barWidth = (width - bars + 1) / bars
    const cy = height / 2
    const minBarHeight = 2

    ctx2d.fillStyle = color
    for (let i = 0; i < bars; i++) {
      const h = Math.max(minBarHeight, (heights[i] ?? 0.05) * height)
      const x = i * (barWidth + 1)
      const y = cy - h / 2
      // Esquinas redondeadas — más prolijo que rect plano.
      const r = Math.min(barWidth / 2, h / 2, 2)
      drawRoundedRect(ctx2d, x, y, barWidth, h, r)
      ctx2d.fill()
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="block"
    />
  )
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
