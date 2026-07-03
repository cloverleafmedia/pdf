// Downloads and installs a portable Java runtime + veraPDF (PDF/A validator)
// into vendor/verapdf-runtime/, so the PDF/A-Export dialog can run a real,
// certified conformance check instead of only our own heuristic report.
//
// Both are pinned to specific known-good versions rather than "latest", so a
// future release upstream can't silently change what gets bundled without a
// deliberate version bump here.
//
// Not run automatically by `npm install` — it downloads ~120MB and takes a
// minute or two. Run once via `npm run setup:verapdf` before `npm run dist`.
// `vendor/` is gitignored: these are build-time binary dependencies, not
// something to keep in version control.
//
// Licensing: the JRE (Eclipse Temurin) is GPLv2 with the Classpath Exception;
// veraPDF is dual-licensed GPLv3+/MPLv2+ — we redistribute under the MPLv2+
// option, which only requires retaining notices/license text and pointing at
// the (already public) source, not offering our own source distribution.
// See THIRD-PARTY-LICENSES.txt (appended by scripts/build-licenses.js).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const https = require("https");

const JRE_URL =
  "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.19%2B10/OpenJDK17U-jre_x64_windows_hotspot_17.0.19_10.zip";
const VERAPDF_URL = "https://software.verapdf.org/releases/verapdf-installer.zip";
const VERAPDF_VERSION = "1.30.2";

const rootDir = path.join(__dirname, "..");
const vendorDir = path.join(rootDir, "vendor");
const runtimeDir = path.join(vendorDir, "verapdf-runtime");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clover-verapdf-setup-"));

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
    console.error("setup-verapdf.js unterstuetzt aktuell nur Windows (CloverleafPDF ist eine Windows-App).");
    process.exit(1);
  }
  if (fs.existsSync(runtimeDir)) {
    console.log("vendor/verapdf-runtime existiert bereits — loesche und baue neu auf.");
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(runtimeDir, { recursive: true });

  console.log("Lade portable Java-Laufzeit (Eclipse Temurin 17 JRE) ...");
  const jreZip = path.join(tmpDir, "jre.zip");
  await download(JRE_URL, jreZip);
  extractZip(jreZip, path.join(tmpDir, "jre-extracted"));
  const jreInner = fs.readdirSync(path.join(tmpDir, "jre-extracted"))[0];
  fs.renameSync(path.join(tmpDir, "jre-extracted", jreInner), path.join(runtimeDir, "jre"));

  console.log("Lade veraPDF-Installer ...");
  const verapdfZip = path.join(tmpDir, "verapdf-installer.zip");
  await download(VERAPDF_URL, verapdfZip);
  extractZip(verapdfZip, path.join(tmpDir, "verapdf-extracted"));
  const installerDir = path.join(tmpDir, "verapdf-extracted", `verapdf-greenfield-${VERAPDF_VERSION}`);
  const installerJar = fs
    .readdirSync(installerDir)
    .find((f) => f.startsWith("verapdf-izpack-installer"));
  if (!installerJar) throw new Error("veraPDF-Installer-JAR nicht gefunden — Version geaendert?");

  const installDir = path.join(runtimeDir, "verapdf");
  const optionsFile = path.join(tmpDir, "verapdf-options.txt");
  // Forward slashes only: this is a Java .properties file, and INSTALL_PATH
  // with Windows backslashes gets mangled by .properties escape parsing.
  fs.writeFileSync(optionsFile, `#veraPDF Software ${VERAPDF_VERSION}\nINSTALL_PATH=${installDir.replace(/\\/g, "/")}\n`);

  console.log("Installiere veraPDF (unattended) ...");
  const javaExe = path.join(runtimeDir, "jre", "bin", "java.exe");
  execFileSync(javaExe, ["-jar", path.join(installerDir, installerJar), "-options", optionsFile], {
    stdio: "inherit",
  });

  if (!fs.existsSync(path.join(installDir, "bin", `cli-${VERAPDF_VERSION}.jar`))) {
    throw new Error("veraPDF-Installation scheint fehlgeschlagen — cli-jar fehlt.");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Fertig: vendor/verapdf-runtime/ enthaelt jre/ und verapdf/.");
}

main().catch((e) => {
  console.error("Fehler:", e.message);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
