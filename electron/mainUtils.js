// Pure, Electron-API-independent helpers extracted out of main.js so they
// can be unit-tested with plain Vitest, same as pkcs7Verify.js.
const fs   = require('fs')
const path = require('path')

function assertExtension(filePath, allowed) {
  const ext = path.extname(filePath).toLowerCase()
  if (!allowed.has(ext)) {
    throw new Error(`Dateityp "${ext}" ist für diese Operation nicht erlaubt.`)
  }
}

// Defense-in-depth on top of the extension allowlist above: even a
// matching-extension path must not resolve inside one of the app's own
// install/resource directories, so a compromised renderer can't overwrite
// (or read) the app's own files via the generic fs:read/fs:write channels.
// filePath is resolved first so a ".."-segment can't walk out of a denied
// root while still textually starting with it (or vice versa).
function isPathDenied(filePath, deniedRoots) {
  const resolved = path.resolve(filePath)
  return deniedRoots.some(root => {
    if (!root) return false
    const resolvedRoot = path.resolve(root)
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  })
}

// In production: argv = [exe, file?]; in dev: argv = [electron, main.js, file?]
function getInitialFile(argv, isDev) {
  const args = argv.slice(isDev ? 2 : 1)
  return args.find(a => !a.startsWith('-') && a.toLowerCase().endsWith('.pdf') && fs.existsSync(a)) || null
}

// Capped at LIBRARY_SCAN_LIMIT files / LIBRARY_SCAN_DEPTH directory levels so a
// folder pointed at something huge (e.g. a whole user profile) can't hang the app.
const LIBRARY_SCAN_LIMIT = 2000
const LIBRARY_SCAN_DEPTH = 6

function scanFolder(root, results) {
  const walk = (dir, depth) => {
    if (results.length >= LIBRARY_SCAN_LIMIT || depth > LIBRARY_SCAN_DEPTH) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (results.length >= LIBRARY_SCAN_LIMIT) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        try {
          const stat = fs.statSync(full)
          results.push({ path: full, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs })
        } catch {}
      }
    }
  }
  walk(root, 0)
}

module.exports = { assertExtension, isPathDenied, getInitialFile, scanFolder, LIBRARY_SCAN_LIMIT, LIBRARY_SCAN_DEPTH }
