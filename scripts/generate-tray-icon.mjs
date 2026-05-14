// Genera resources/icons/trayTemplate.png + trayTemplate@2x.png.
// Se ejecuta una sola vez en setup; los PNGs resultantes se commitean.
//
// El sufijo "Template" es convención de macOS: Electron auto-aplica template-image
// behavior (negro+alfa, invierte en dark mode). El @2x sirve para pantallas retina.
//
// Diseño: micrófono sólido negro, 16x16 (32x32 @2x) sobre fondo transparente.

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../resources/icons')
fs.mkdirSync(OUT_DIR, { recursive: true })

function crc32(buf) {
  let c = ~0 >>> 0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/**
 * Devuelve una matriz width x height con valores 0/1 (1 = pintar pixel negro).
 * Dibuja un micrófono estilizado: cápsula superior redondeada + base con pie.
 */
function micShape(size) {
  const grid = Array.from({ length: size }, () => new Array(size).fill(0))
  const cx = size / 2
  // Cápsula superior (vertical rounded rect):
  const capW = Math.round(size * 0.34)
  const capH = Math.round(size * 0.50)
  const capX0 = Math.round(cx - capW / 2)
  const capY0 = Math.round(size * 0.10)
  const r = Math.round(capW / 2)
  for (let y = capY0; y < capY0 + capH; y++) {
    for (let x = capX0; x < capX0 + capW; x++) {
      const insideTop = y < capY0 + r
        ? (x - (capX0 + r)) ** 2 + (y - (capY0 + r)) ** 2 <= r * r
        : true
      const insideBot = y > capY0 + capH - r - 1
        ? (x - (capX0 + r)) ** 2 + (y - (capY0 + capH - r - 1)) ** 2 <= r * r
        : true
      if (insideTop && insideBot && x >= 0 && x < size && y >= 0 && y < size) {
        grid[y][x] = 1
      }
    }
  }
  // Arco inferior (la base en U):
  const arcY = Math.round(size * 0.62)
  const arcW = Math.round(size * 0.62)
  const arcH = Math.round(size * 0.18)
  const arcX0 = Math.round(cx - arcW / 2)
  const arcRy = arcH
  const arcRx = arcW / 2
  const thickness = Math.max(1, Math.round(size * 0.085))
  for (let y = arcY; y < arcY + arcH + thickness; y++) {
    for (let x = arcX0; x <= arcX0 + arcW; x++) {
      const dx = x - cx
      const dy = y - arcY
      if (dy < 0) continue
      const norm = (dx * dx) / (arcRx * arcRx) + (dy * dy) / (arcRy * arcRy)
      const outerBand = norm <= 1 && norm >= 1 - thickness / arcRy
      if (outerBand && x >= 0 && x < size && y >= 0 && y < size) grid[y][x] = 1
    }
  }
  // Tallo central + pie:
  const stemY0 = arcY + arcH
  const stemY1 = Math.round(size * 0.88)
  const stemThick = Math.max(1, Math.round(size * 0.075))
  for (let y = stemY0; y <= stemY1; y++) {
    for (let x = Math.round(cx - stemThick / 2); x <= Math.round(cx + stemThick / 2); x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) grid[y][x] = 1
    }
  }
  const footW = Math.round(size * 0.34)
  const footY = stemY1
  for (let x = Math.round(cx - footW / 2); x <= Math.round(cx + footW / 2); x++) {
    for (let y = footY; y <= footY + Math.max(0, Math.round(size * 0.06)); y++) {
      if (x >= 0 && x < size && y >= 0 && y < size) grid[y][x] = 1
    }
  }
  return grid
}

function makePng(size) {
  const grid = micShape(size)
  // RGBA raw rows, cada fila con filtro=0
  const rowBytes = size * 4
  const raw = Buffer.alloc((rowBytes + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter type none
    for (let x = 0; x < size; x++) {
      const on = grid[y][x] === 1
      raw[p++] = 0
      raw[p++] = 0
      raw[p++] = 0
      raw[p++] = on ? 255 : 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8     // bit depth
  ihdr[9] = 6     // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = zlib.deflateSync(raw)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const png1x = makePng(16)
const png2x = makePng(32)
fs.writeFileSync(path.join(OUT_DIR, 'trayTemplate.png'), png1x)
fs.writeFileSync(path.join(OUT_DIR, 'trayTemplate@2x.png'), png2x)

console.log(`trayTemplate.png    -> ${png1x.length} bytes (16x16)`)
console.log(`trayTemplate@2x.png -> ${png2x.length} bytes (32x32)`)
