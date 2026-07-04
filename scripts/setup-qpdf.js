// Downloads a portable qpdf build into vendor/qpdf-runtime/, so the "PDF
// verschluesseln"-dialog can shell out to a real, standards-compliant PDF
// encryption tool. pdf-lib itself has no encryption support at all.
//
// Pinned to a specific known-good version rather than "latest", so a future
// qpdf release can't silently change what gets bundled without a deliberate
// version bump here.
//
// Not run automatically by `npm install` — run once via `npm run setup:qpdf`
// before `npm run dist`. `vendor/` is gitignored: build-time binary
// dependency, not something to keep in version control.
//
// Licensing: qpdf is Apache License 2.0 — permissive, only requires
// retaining the license/notice text. See THIRD-PARTY-LICENSES.txt
// (appended by scripts/build-licenses.js).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const https = require("https");

const QPDF_VERSION = "12.3.2";
const QPDF_URL = `https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}-mingw64.zip`;
const QPDF_LICENSE_URL = `https://raw.githubusercontent.com/qpdf/qpdf/v${QPDF_VERSION}/LICENSE.txt`;

const rootDir = path.join(__dirname, "..");
const vendorDir = path.join(rootDir, "vendor");
const runtimeDir = path.join(vendorDir, "qpdf-runtime");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clover-qpdf-setup-"));

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirectsLeft) => {
      https
        .get(u, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (redirectsLeft <= 0) return reject(new Error("Zu viele Redirects: " + url));
            res.resume();
            return follow(res.headers.location, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} bei ${u}`));
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
          file.on("error", reject);
        })
        .on("error", reject);
    };
    follow(url, 5);
  });
}

// Node has no built-in zip extraction; unzip.exe ships with Windows via
// "tar" (bsdtar, supports zip since Win10 1803) so no extra dependency needed.
function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "inherit" });
}

async function main() {
  if (process.platform !== "win32") {
    console.error("setup-qpdf.js unterstuetzt aktuell nur Windows (CloverleafPDF ist eine Windows-App).");
    process.exit(1);
  }
  if (fs.existsSync(runtimeDir)) {
    console.log("vendor/qpdf-runtime existiert bereits — loesche und baue neu auf.");
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(runtimeDir, { recursive: true });

  console.log("Lade portables qpdf ...");
  const qpdfZip = path.join(tmpDir, "qpdf.zip");
  await download(QPDF_URL, qpdfZip);
  extractZip(qpdfZip, tmpDir);
  const extractedDir = path.join(tmpDir, `qpdf-${QPDF_VERSION}-mingw64`);

  // Only bin/ is needed at runtime (qpdf.exe + its own DLLs) — include/lib/share
  // (headers, static libs, docs) would only bloat the installer.
  fs.cpSync(path.join(extractedDir, "bin"), path.join(runtimeDir, "bin"), { recursive: true });

  if (!fs.existsSync(path.join(runtimeDir, "bin", "qpdf.exe"))) {
    throw new Error("qpdf-Installation scheint fehlgeschlagen — qpdf.exe fehlt.");
  }

  console.log("Lade qpdf-Lizenztext ...");
  await download(QPDF_LICENSE_URL, path.join(runtimeDir, "LICENSE.txt"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Fertig: vendor/qpdf-runtime/bin/ enthaelt qpdf.exe.");
}

main().catch((e) => {
  console.error("Fehler:", e.message);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
