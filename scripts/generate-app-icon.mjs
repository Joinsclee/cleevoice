// Ícono de la app de CleeVoice (premium).
//
// Diseño:
//   - Squircle estilo Big Sur (radius 22.5% del lado)
//   - Gradiente multi-stop violeta → azul (paleta JoinsClee), enriquecido con
//     una sutil "luz superior" especular y un degradado inferior oscuro para
//     dar volumen.
//   - Ondas de sonido concéntricas detrás del micrófono (3 anillos sutiles).
//   - Micrófono blanco con grilla horizontal en la cápsula, arco U inferior,
//     tallo y base. Drop-shadow sutil debajo para profundidad.
//
// Generado puro con node:zlib (sin imagemagick, sin canvas, sin sharp) para
// que cualquiera pueda regenerarlo con `node scripts/generate-app-icon.mjs`.
//
// Output:
//   build/icon.iconset/  (10 PNGs para iconutil → .icns)
//   build/icon.icns      (después de `npm run icons`)
//   build/icon.png       (1024 — electron-builder fallback)
//   build/icon-256.png   (256 — fuente para Windows .ico)

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICONSET_DIR = path.resolve(__dirname, '../build/icon.iconset')
const BUILD_DIR = path.resolve(__dirname, '../build')
fs.mkdirSync(ICONSET_DIR, { recursive: true })

// ─── Paleta ─────────────────────────────────────────────────────────────────

const COLORS = {
  // Gradiente principal del squircle (3 stops).
  gradTop: [0x8b, 0x5c, 0xf6], // violet-500 más claro arriba
  gradMid: [0x6d, 0x28, 0xd9], // violet-700 en medio
  gradBot: [0x1e, 0x3a, 0x8a], // blue-900 abajo
  // Sombra suave en bordes.
  shadow: [0x09, 0x09, 0x14],
  // Mic en blanco con leve tinte azulado (no #fff puro — se ve menos plano).
  micBody: [0xf5, 0xf7, 0xff],
  // Highlight especular superior.
  highlight: [0xff, 0xff, 0xff]
}

// ─── Helpers de color ───────────────────────────────────────────────────────

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}
function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}
function mix(base, over, alpha) {
  return [
    lerp(base[0], over[0], alpha),
    lerp(base[1], over[1], alpha),
    lerp(base[2], over[2], alpha)
  ]
}

// ─── Geometría reusable ─────────────────────────────────────────────────────

function smoothStep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Squircle (rounded-square) con antialias 1px en el borde.
 * Devuelve 0..1.
 */
function squircleAlpha(x, y, size, r) {
  let dx = 0
  if (x < r) dx = r - x
  else if (x > size - r) dx = x - (size - r)
  let dy = 0
  if (y < r) dy = r - y
  else if (y > size - r) dy = y - (size - r)
  const d = Math.hypot(dx, dy)
  if (d <= r - 0.5) return 1
  if (d >= r + 0.5) return 0
  return 1 - (d - (r - 0.5))
}

/**
 * Distancia a un rounded-rect (signed): negativa adentro, positiva afuera.
 * Útil para hacer shapes con bordes suaves.
 */
function roundedRectSDF(x, y, cx, cy, w, h, r) {
  const dx = Math.max(Math.abs(x - cx) - w / 2 + r, 0)
  const dy = Math.max(Math.abs(y - cy) - h / 2 + r, 0)
  return Math.hypot(dx, dy) - r
}

/**
 * Distancia a un anillo (ring): negativa adentro del anillo, positiva afuera.
 * Usado para dibujar ondas de sonido.
 */
function ringSDF(x, y, cx, cy, radius, thickness) {
  const d = Math.hypot(x - cx, y - cy)
  return Math.abs(d - radius) - thickness / 2
}

// ─── Pintado por pixel ──────────────────────────────────────────────────────

/**
 * Calcula el color RGBA final de un pixel del ícono.
 * Coords (x, y) en pixeles; size = tamaño del ícono.
 */
function pixel(x, y, size) {
  const u = x / size
  const v = y / size

  // 1) Squircle mask con antialias.
  const r = size * 0.225
  const sqA = squircleAlpha(x, y, size, r)
  if (sqA <= 0) return [0, 0, 0, 0]

  // 2) Color base — gradiente vertical de 3 stops.
  let base
  if (v < 0.5) base = lerp3(COLORS.gradTop, COLORS.gradMid, v / 0.5)
  else base = lerp3(COLORS.gradMid, COLORS.gradBot, (v - 0.5) / 0.5)

  // 3) Viñeta sutil (oscurecer hacia las esquinas).
  const cx = 0.5
  const cy = 0.5
  const dist = Math.hypot(u - cx, v - cy)
  const vignette = Math.max(0, 1 - dist * 1.4)
  base = lerp3(COLORS.shadow, base, 0.55 + 0.45 * vignette)

  // 4) Ondas de sonido concéntricas detrás del mic (3 anillos sutiles).
  // Cada anillo aporta un blanco semitransparente.
  for (const ring of [
    { r: size * 0.28, t: 1.5, alpha: 0.06 },
    { r: size * 0.36, t: 1.2, alpha: 0.045 },
    { r: size * 0.44, t: 1.0, alpha: 0.03 }
  ]) {
    const d = ringSDF(x, y, size * 0.5, size * 0.5, ring.r, ring.t)
    const a = (1 - smoothStep(-0.5, 0.5, d)) * ring.alpha
    if (a > 0) base = mix(base, [255, 255, 255], a)
  }

  // 5) Highlight especular superior (banda blanca tenue arriba).
  // Curva más fuerte cerca del top, fadea hacia el centro.
  const topHighlight = smoothStep(0.0, 0.35, v) * 0.18 // peak ~ v=0
  const topAlpha = Math.max(0, 0.18 - topHighlight)
  if (topAlpha > 0) base = mix(base, COLORS.highlight, topAlpha)

  // 6) Sombra inferior interna sutil (oscurece bordes inferiores).
  const bottomShadow = (1 - smoothStep(0.55, 1.0, v)) * 0.0 + smoothStep(0.7, 1.0, v) * 0.18
  if (bottomShadow > 0) base = mix(base, COLORS.shadow, bottomShadow)

  // 7) Micrófono — coords centradas en (0.5, 0.5), escala respecto al tamaño.
  const micAlpha = renderMic(x, y, size)
  if (micAlpha > 0) {
    // Sombra del mic (offset 2% hacia abajo, blur 4%).
    const sx = x
    const sy = y - size * 0.02
    const micShadow = renderMic(sx, sy, size)
    if (micShadow > 0) {
      base = mix(base, COLORS.shadow, micShadow * 0.25)
    }
    base = mix(base, COLORS.micBody, micAlpha)
  }

  // 8) Recortar al squircle con antialiasing.
  const alpha255 = Math.round(255 * sqA)
  return [base[0], base[1], base[2], alpha255]
}

/**
 * Devuelve 0..1 para los pixeles del micrófono.
 * Combina: cápsula con grilla horizontal + arco U + tallo + base.
 */
function renderMic(x, y, size) {
  const cx = size * 0.5
  const cy = size * 0.5

  // Cápsula: rounded-rect vertical centrado, 0.20×0.32 del tamaño aprox.
  const capW = size * 0.21
  const capH = size * 0.33
  const capCy = size * 0.42
  const capR = capW / 2
  const capSDF = roundedRectSDF(x, y, cx, capCy, capW, capH, capR)
  let capAlpha = 1 - smoothStep(-0.5, 0.5, capSDF)
  if (capAlpha < 0) capAlpha = 0

  // Líneas horizontales que sugieren la grilla del mic — 5 líneas equiespaciadas
  // que "vacían" el body de la cápsula en ~30% para no perder presencia.
  if (capAlpha > 0) {
    const innerY = (y - (capCy - capH / 2)) / capH
    if (innerY > 0.18 && innerY < 0.82) {
      const lineCycle = ((innerY - 0.18) / (0.82 - 0.18)) * 5 // 5 ciclos
      const fraction = lineCycle - Math.floor(lineCycle)
      // Cada banda: 70% relleno, 30% vacío con suave transición.
      const insideLine = smoothStep(0.65, 0.75, fraction) - smoothStep(0.92, 0.98, fraction)
      capAlpha *= 1 - insideLine * 0.22
    }
  }

  // Arco U inferior (semicírculo grueso).
  const arcCenterY = size * 0.62
  const arcOuter = size * 0.16
  const arcThick = size * 0.025
  const distArc = Math.hypot(x - cx, y - arcCenterY)
  let arcAlpha = 0
  if (y >= arcCenterY) {
    arcAlpha =
      (1 - smoothStep(arcOuter - 0.5, arcOuter + 0.5, distArc)) *
      smoothStep(arcOuter - arcThick - 0.5, arcOuter - arcThick + 0.5, distArc)
  }

  // Tallo central (rect vertical fino).
  const stemSDF = roundedRectSDF(x, y, cx, size * 0.745, size * 0.025, size * 0.16, size * 0.012)
  const stemAlpha = 1 - smoothStep(-0.5, 0.5, stemSDF)

  // Base (rect horizontal con esquinas redondeadas).
  const baseSDF = roundedRectSDF(x, y, cx, size * 0.825, size * 0.18, size * 0.03, size * 0.012)
  const baseAlpha = 1 - smoothStep(-0.5, 0.5, baseSDF)

  return Math.max(capAlpha, arcAlpha, stemAlpha, baseAlpha)
}

// ─── PNG encoder mínimo ─────────────────────────────────────────────────────

function crc32(buf) {
  let c = ~0 >>> 0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makePng(size) {
  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ─── Outputs ────────────────────────────────────────────────────────────────

const SIZES = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' }
]

console.log('Generando ícono de CleeVoice…')
for (const { size, name } of SIZES) {
  const png = makePng(size)
  fs.writeFileSync(path.join(ICONSET_DIR, name), png)
  console.log(`  ${name.padEnd(28)} ${String(size).padStart(4)}px  ${(png.length / 1024).toFixed(1)}KB`)
}

fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), makePng(1024))
fs.writeFileSync(path.join(BUILD_DIR, 'icon-256.png'), makePng(256))
console.log('  build/icon.png             1024px  (electron-builder fallback)')
console.log('  build/icon-256.png          256px  (Windows .ico source)')

console.log('\n✓ Listo. Corré `iconutil -c icns build/icon.iconset -o build/icon.icns`')
console.log('  o directamente `npm run icons`.')
