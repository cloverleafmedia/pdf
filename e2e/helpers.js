// Real Electron functional-test harness via Playwright's _electron support.
// Unlike raw OS-level mouse/keyboard automation (unreliable in past sessions
// here - windows reported as unfocused/hidden, DPI/coordinate mismatches),
// Playwright drives the actual renderer via CDP: real clicks, real state
// updates, real screenshots. Confirmed working (document.hidden === false,
// document.hasFocus() === true) in this environment before this harness was
// added.
//
// Electron's main.js only ever loads http://localhost:5173 in dev mode
// (isDev = !app.isPackaged is true for any non-packaged launch, regardless of
// NODE_ENV) - so a real Vite dev server must be running before the app
// launches. This harness starts one, waits for it, launches Electron against
// it, and tears both down together.
import { _electron as electron } from 'playwright'
import { spawn, exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = path.resolve(__dirname, '..')
const VITE_PORT = 5173
const VITE_URL = `http://localhost:${VITE_PORT}`

async function waitForVite(timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(VITE_URL)
      if (res.ok) return
    } catch (_) { /* not up yet, keep polling */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Vite dev server did not become ready on ${VITE_URL} within ${timeoutMs}ms`)
}

// A shell-spawned `npx vite` on Windows leaves the real node process running
// under a cmd.exe wrapper - plain child.kill() only kills the shell, not its
// children. taskkill /T kills the whole process tree instead.
function killProcessTree(child) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${child.pid} /T /F`, () => resolve())
    } else {
      child.kill()
      resolve()
    }
  })
}

// Starts a Vite dev server + the Electron app against it, and returns
// { app, window, close() }. Callers must always call close() (e.g. in an
// afterAll) so neither process is left running.
export async function launchApp() {
  // Passed as a single command string (not an args array) with shell:true -
  // Node deprecates the array+shell combination (DEP0190) since re-splitting
  // already-split args through a shell reintroduces escaping ambiguity; not a
  // real risk here (fixed literal command, no external input), but avoided
  // for a clean run anyway.
  const viteProcess = spawn(`npx vite --port ${VITE_PORT} --strictPort`, {
    cwd: PROJECT_DIR,
    shell: true,
    stdio: 'ignore',
  })

  try {
    await waitForVite()
  } catch (e) {
    await killProcessTree(viteProcess)
    throw e
  }

  let app
  try {
    app = await electron.launch({
      args: [PROJECT_DIR],
      env: { ...process.env, NODE_ENV: 'development' },
      timeout: 30000,
    })
  } catch (e) {
    await killProcessTree(viteProcess)
    throw e
  }

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const close = async () => {
    await app.close().catch(() => {})
    await killProcessTree(viteProcess)
  }

  return { app, window, close }
}

// Opens a PDF by absolute path via the app's own imperative bridge
// (window._loadPDF, wired up in App.jsx and already used by the toolbar's
// own "Open" button/recent-files list) - Playwright can't drive the native
// OS file-open dialog directly, so this is the equivalent, dialog-free path.
// Waits until the toolbar's Save button is enabled as a proxy for "a document
// is now loaded", the same observable state a real user would see.
export async function openPdf(window, absolutePath) {
  await window.evaluate((p) => window._loadPDF?.(p), absolutePath)
  await window.waitForFunction(() => {
    const btn = document.querySelector('button[title*="Speichern (Strg"]')
    return btn && !btn.disabled
  }, { timeout: 10000 })
}
