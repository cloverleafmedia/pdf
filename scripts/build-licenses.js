const fs = require("fs");
const path = require("path");
const checker = require("license-checker");

const outputPath = path.join(__dirname, "..", "THIRD-PARTY-LICENSES.txt");

checker.init({ start: path.join(__dirname, ".."), production: true, excludePackages: "cloverleaf-pdf@1.0.0" }, (err, data) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const keys = Object.keys(data).sort((a, b) => a.localeCompare(b));

  let out = "CloverleafPDF - Third-Party Licenses\n";
  out += "======================================\n\n";
  out += "Diese Anwendung nutzt Open-Source-Software Dritter. Nachfolgend die Lizenzhinweise aller Produktiv-Abhaengigkeiten.\n\n";

  for (const key of keys) {
    const pkg = data[key];
    out += "----------------------------------------------------------------------\n";
    out += key + "\n";
    out += "Lizenz: " + (pkg.licenses || "UNKNOWN") + "\n";
    if (pkg.repository) out += "Repository: " + pkg.repository + "\n";
    if (pkg.publisher) out += "Publisher: " + pkg.publisher + "\n";
    out += "\n";
    if (pkg.licenseText) {
      out += pkg.licenseText.trim() + "\n";
    } else if (pkg.copyright) {
      out += pkg.copyright + "\n";
    }
    out += "\n";
  }

  // Nicht-npm-Assets, die mitgeliefert werden — hier manuell gepflegt, da
  // license-checker nur package.json-Abhaengigkeiten erfasst.
  out += "----------------------------------------------------------------------\n";
  out += "sRGB_v4_ICC_preference.icc (src/assets/)\n";
  out += "Lizenz: Freie Nutzung/Kopie/Weitergabe unveraendert, mit Copyright-Hinweis\n";
  out += "Quelle: https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference.icc\n";
  out += "Publisher: International Color Consortium\n\n";
  out += "Copyright 2007 International Color Consortium. Permission is hereby granted,\n";
  out += "without fee, to use, copy and distribute this file for any purpose, provided\n";
  out += "the file is used \"as-is\" without modification and that this notice remains\n";
  out += "unaltered. Verwendet im PDF/A-Export als eingebettetes OutputIntent-Farbprofil.\n\n";

  fs.writeFileSync(outputPath, out);
  console.log("THIRD-PARTY-LICENSES.txt geschrieben:", keys.length, "Pakete");
});
