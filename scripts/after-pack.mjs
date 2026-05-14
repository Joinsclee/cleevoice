// Hook afterPack de electron-builder.
//
// Después de empaquetar la .app de macOS, firma ad-hoc el bundle entero
// recursivamente. Sin esto, macOS Sonoma+ rechaza la app con el error
// "CleeVoice está dañado y no se puede abrir" — ni siquiera ofrece el
// diálogo "Abrir igual" porque la app no tiene firma alguna.
//
// La firma ad-hoc (--sign -) NO requiere Apple Developer ID. Es suficiente
// para que Gatekeeper deje arrancar la app con el flow estándar de "primera
// apertura → no se puede verificar el desarrollador → Abrir igual".
//
// Notas:
//  - --deep firma TODOS los binarios y libs dentro del .app, incluyendo los
//    bundles de whisper-cli + dylibs ggml que ya firmamos individualmente
//    en bundle-whisper-mac.sh. Re-firmarlos como parte del .app no rompe
//    nada (--force sobrescribe).
//  - --timestamp=none evita el RTT al timestamp server de Apple, no aplica
//    a firmas ad-hoc.
//  - El hardenedRuntime está en false en electron-builder.yml — no aplica
//    sin Developer ID y Gatekeeper no lo exige para ad-hoc.

import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * @param {{ electronPlatformName: string, appOutDir: string, packager: { appInfo: { productFilename: string } } }} context
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const productName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${productName}.app`)

  console.log(`  • after-pack: ad-hoc signing ${appPath}`)
  try {
    // --force: sobrescribe firmas existentes (las que el bundling de whisper agregó).
    // --deep:  firma recursivamente todos los binarios anidados.
    // --sign -: firma ad-hoc (sin certificado de Developer ID).
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
    console.log(`  • after-pack: ad-hoc sign OK`)

    // Verificación: spctl --assess no va a pasar (ad-hoc no es trusted), pero
    // codesign --verify --deep --strict debería dar exit 0.
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' })
    console.log(`  • after-pack: codesign verify OK`)
  } catch (err) {
    console.error(`  ✗ after-pack failed:`, err.message)
    throw err
  }
}
