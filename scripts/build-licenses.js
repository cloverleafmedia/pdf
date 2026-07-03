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

  fs.writeFileSync(outputPath, out);
  console.log("THIRD-PARTY-LICENSES.txt geschrieben:", keys.length, "Pakete");
});
