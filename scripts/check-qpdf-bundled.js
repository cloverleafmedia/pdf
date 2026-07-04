// Guard for `npm run dist`: electron-builder's extraResources config expects
// vendor/qpdf-runtime to exist. Failing here with a clear message beats a
// cryptic electron-builder ENOENT deep in its own build pipeline.
const fs = require("fs");
const path = require("path");

const required = path.join(__dirname, "..", "vendor", "qpdf-runtime", "bin", "qpdf.exe");

if (!fs.existsSync(required)) {
  console.error(
    "\nvendor/qpdf-runtime fehlt — wird fuer die PDF-Verschluesselung (qpdf) benoetigt.\n" +
    "Einmalig ausfuehren: npm run setup:qpdf\n"
  );
  process.exit(1);
}
