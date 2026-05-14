// Descarga el release oficial precompilado de whisper.cpp para Windows x64
// (con BLAS para acelerar en CPU) y lo descomprime en resources/whisper-win/.
//
// El zip ya incluye whisper-cli.exe + todas las DLLs requeridas — no hay
// que hacer install_name_tool ni patches binarios (Windows resuelve DLLs
// del mismo directorio del .exe por default).
//
// Se puede correr en Mac, Linux o Windows (es puro Node). El binario
// resultante sólo funciona ejecutado en Windows x64.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import extract from 'extract-zip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'resources', 'whisper-win')
const TMP_ZIP = path.join(ROOT, 'resources', 'whisper-win.zip')

// Variante "blas" — BLAS-accelerated CPU. Sin BLAS sería 5-10x más lenta.
const VERSION = process.env.WHISPER_VERSION || 'v1.8.4'
const URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${VERSION}/whisper-blas-bin-x64.zip`

async function download(url, destPath) {
  console.log(`→ Descargando ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} bajando ${url}`)
  }
  const total = res.headers.get('content-length')
  console.log(`  ${total ? `${(parseInt(total) / 1024 / 1024).toFixed(1)}MB` : '?'}`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath))
}

async function findExeAndDlls(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  let exe = null
  const flat = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      const sub = await findExeAndDlls(full)
      if (sub.exe && !exe) exe = sub.exe
      flat.push(...sub.flat)
    } else {
      flat.push(full)
      // El release oficial usa 'main.exe' o 'whisper-cli.exe' según la versión.
      if (e.name === 'whisper-cli.exe' || e.name === 'main.exe') {
        exe = full
      }
    }
  }
  return { exe, flat }
}

async function main() {
  if (fs.existsSync(OUT)) {
    console.log(`→ Limpiando ${OUT}`)
    await fs.promises.rm(OUT, { recursive: true, force: true })
  }
  await fs.promises.mkdir(OUT, { recursive: true })

  await download(URL, TMP_ZIP)

  console.log(`→ Descomprimiendo en ${OUT}`)
  await extract(TMP_ZIP, { dir: OUT })

  const { exe, flat } = await findExeAndDlls(OUT)
  if (!exe) {
    throw new Error(
      `No se encontró whisper-cli.exe ni main.exe en el zip — la estructura cambió.`
    )
  }

  // Si el .exe se llama main.exe, lo renombramos a whisper-cli.exe (lo que espera src/main).
  let finalExePath = exe
  if (path.basename(exe) === 'main.exe') {
    finalExePath = path.join(path.dirname(exe), 'whisper-cli.exe')
    await fs.promises.rename(exe, finalExePath)
    console.log(`  main.exe → whisper-cli.exe`)
  }

  // Aplanamos: si los archivos vinieron en un subdir (ej Release/), los movemos al root de OUT.
  const exeDir = path.dirname(finalExePath)
  if (exeDir !== OUT) {
    for (const f of await fs.promises.readdir(exeDir)) {
      await fs.promises.rename(path.join(exeDir, f), path.join(OUT, f))
    }
    // Borramos los subdirs vacíos.
    for (const e of await fs.promises.readdir(OUT, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const sub = path.join(OUT, e.name)
        const remaining = await fs.promises.readdir(sub)
        if (remaining.length === 0) await fs.promises.rmdir(sub)
      }
    }
  }

  await fs.promises.unlink(TMP_ZIP).catch(() => {})

  // Limpieza: el zip oficial trae 20+ ejemplos (bench, server, stream, wchess…)
  // que no usamos. Dejamos solo lo necesario para transcribir.
  const KEEP = new Set([
    'whisper-cli.exe',
    'whisper.dll',
    'ggml.dll',
    'ggml-base.dll',
    'ggml-cpu.dll',
    'ggml-blas.dll',
    'libopenblas.dll'
  ])
  for (const f of await fs.promises.readdir(OUT)) {
    if (!KEEP.has(f)) {
      const p = path.join(OUT, f)
      const stat = await fs.promises.stat(p)
      if (stat.isDirectory()) await fs.promises.rm(p, { recursive: true, force: true })
      else await fs.promises.unlink(p)
    }
  }

  const final = await fs.promises.readdir(OUT)
  console.log(`✅ Bundle listo en ${OUT}`)
  console.log(`   ${final.length} archivos: ${final.slice(0, 8).join(', ')}${final.length > 8 ? '…' : ''}`)
  console.log(`   ${flat.length} archivos totales en el zip original`)
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
