// Genera el ícono de la app de CleeVoice en todos los tamaños macOS/Win + Linux.
//
// Diseño: rounded-square con gradiente violeta→azul (paleta JoinsClee) +
// micrófono blanco centrado. Generado puro en node:zlib (sin deps externas)
// para que cualquiera pueda regenerarlo sin instalar nada.
//
// Output:
//   build/icon.iconset/  (10 PNGs para iconutil → .icns Mac)
//   build/icon.icns      (después del iconutil)
//   build/icon.png       (1024×1024 fallback genérico)
//   build/icon-256.png   (alias para Windows .ico via electron-builder)
//
// Después del script, hay que correr:
//   iconutil -c icns build/icon.iconset -o build/icon.icns
//
// (npm run icons hace ambos pasos).

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICONSET_DIR = path.resolve(__dirname, '../build/icon.iconset')
const BUILD_DIR = path.resolve(__dirname, '../build')
fs.mkdirSync(ICONSET_DIR, { recursive: true })

// ─── Diseño ─────────────────────────────────────────────────────────────────

const COLOR_VIOLET = [0x7c, 0x3a, 0xed] // gradient start
const COLOR_BLUE = [0x25, 0x63, 0xeb] // gradient end
const COLOR_DARK = [0x0b, 0x0b, 0x14] // shadow background

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

/**
 * Devuelve [r, g, b, a] (0-255) para un pixel del ícono.
 * Composición: rounded-square con gradiente diagonal + micrófono centrado.
 */
function pixel(x, y, size) {
  const u = x / size // 0..1
  const v = y / size

  // 1) rounded-square mask (corner radius = ~22.5% del tamaño = macOS style).
  const r = size * 0.225
  const mask = roundedSquareAlpha(x, y, size, size, r)
  if (mask === 0) return [0, 0, 0, 0]

  // 2) base color: gradiente diagonal violeta→azul.
  const t = (u + v) / 2
  let R = lerp(COLOR_VIOLET[0], COLOR_BLUE[0], t)
  let G = lerp(COLOR_VIOLET[1], COLOR_BLUE[1], t)
  let B = lerp(COLOR_VIOLET[2], COLOR_BLUE[2], t)

  // 3) sutil viñeta oscura en las esquinas.
  const cx = 0.5,
    cy = 0.5
  const dist = Math.hypot(u - cx, v - cy)
  const vignette = Math.max(0, 1 - dist * 1.3)
  R = lerp(COLOR_DARK[0], R, 0.65 + 0.35 * vignette)
  G = lerp(COLOR_DARK[1], G, 0.65 + 0.35 * vignette)
  B = lerp(COLOR_DARK[2], B, 0.65 + 0.35 * vignette)

  // 4) micrófono blanco centrado.
  const micMask = micAlpha(u, v)
  if (micMask > 0) {
    R = lerp(R, 255, micMask)
    G = lerp(G, 255, micMask)
    B = lerp(B, 255, micMask)
  }

  return [R, G, B, mask]
}

/**
 * Alpha de un rounded-square con esquinas redondeadas.
 * Devuelve 0..255 con antialiasing simple en el borde.
 */
function roundedSquareAlpha(x, y, w, h, r) {
  // Coords relativos al rect.
  let dx = 0
  if (x < r) dx = r - x
  else if (x > w - r) dx = x - (w - r)
  let dy = 0
  if (y < r) dy = r - y
  else if (y > h - r) dy = y - (h - r)
  const d = Math.hypot(dx, dy)
  if (d <= r - 1) return 255
  if (d >= r) return 0
  return Math.round((1 - (d - (r - 1))) * 255)
}

/**
 * Alpha de un micrófono estilizado centrado.
 * Coords u,v ∈ [0..1].
 */
function micAlpha(u, v) {
  // Cápsula (rounded rect vertical) en (0.40-0.60, 0.20-0.55).
  const capL = 0.4,
    capR = 0.6,
    capT = 0.2,
    capB = 0.55
  if (u >= capL - 0.005 && u <= capR + 0.005 && v >= capT - 0.005 && v <= capB + 0.005) {
    const capR2 = (capR - capL) / 2
    const cx = (capL + capR) / 2
    if (v < capT + capR2) {
      const d = Math.hypot(u - cx, v - (capT + capR2))
      if (d <= capR2 + 0.002) return Math.min(1, Math.max(0, (capR2 + 0.002 - d) / 0.004))
      return 0
    }
    if (v > capB - capR2) {
      const d = Math.hypot(u - cx, v - (capB - capR2))
      if (d <= capR2 + 0.002) return Math.min(1, Math.max(0, (capR2 + 0.002 - d) / 0.004))
      return 0
    }
    return 1
  }

  // Arco U bajo la cápsula (0.30-0.70, ~0.58-0.72) — borde grueso.
  const ax = 0.5
  const ay = 0.58
  const arcRx = 0.18
  const arcRy = 0.12
  const norm = ((u - ax) * (u - ax)) / (arcRx * arcRx) + ((v - ay) * (v - ay)) / (arcRy * arcRy)
  if (v >= ay && norm >= 0.7 && norm <= 1.0) return 1

  // Tallo central (0.49-0.51, 0.70-0.80).
  if (u >= 0.49 && u <= 0.51 && v >= 0.7 && v <= 0.8) return 1

  // Base/pie (0.42-0.58, 0.79-0.82).
  if (u >= 0.42 && u <= 0.58 && v >= 0.79 && v <= 0.82) return 1

  return 0
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
    raw[p++] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(raw, { level: 6 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ─── Outputs requeridos por iconutil ────────────────────────────────────────

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

for (const { size, name } of SIZES) {
  const png = makePng(size)
  fs.writeFileSync(path.join(ICONSET_DIR, name), png)
  console.log(`${name.padEnd(28)} ${size}×${size}  ${png.length}B`)
}

// Convenience fallbacks fuera del iconset
fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), makePng(1024))
fs.writeFileSync(path.join(BUILD_DIR, 'icon-256.png'), makePng(256))
console.log('build/icon.png       1024×1024 (electron-builder fallback)')
console.log('build/icon-256.png   256×256   (Windows .ico source)')
