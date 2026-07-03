// Guard for `npm run dist`: electron-builder's extraResources config expects
// vendor/verapdf-runtime to exist. Failing here with a clear message beats a
// cryptic electron-builder ENOENT deep in its own build pipeline.
const fs = require("fs");
const path = require("path");

const required = path.join(__dirname, "..", "vendor", "verapdf-runtime", "verapdf", "bin");

if (!fs.existsSync(required)) {
  console.error(
    "\nvendor/verapdf-runtime fehlt — wird fuer den gebuendelten PDF/A-Validator (veraPDF) benoetigt.\n" +
    "Einmalig ausfuehren: npm run setup:verapdf\n"
  );
  process.exit(1);
}
