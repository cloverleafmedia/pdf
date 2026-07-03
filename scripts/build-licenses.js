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
  out += "sRGB2014.icc (src/assets/)\n";
  out += "Lizenz: Freie Nutzung/Kopie/Weitergabe/Verkauf ohne Einschraenkung (unveraendert)\n";
  out += "Quelle: https://registry.color.org/rgb-registry/profiles/sRGB2014.icc\n";
  out += "Publisher: International Color Consortium\n\n";
  out += "\"This profile is made available by the International Color Consortium, and\n";
  out += "may be copied, distributed, embedded, made, used, and sold without\n";
  out += "restriction.\" (https://registry.color.org/profile-library/) Verwendet im\n";
  out += "PDF/A-Export als eingebettetes OutputIntent-Farbprofil.\n\n";

  out += "----------------------------------------------------------------------\n";
  out += "Eclipse Temurin JRE 17 (vendor/verapdf-runtime/jre/, nicht im Repository, per\n";
  out += "'npm run setup:verapdf' geladen und in den Installer gebuendelt)\n";
  out += "Lizenz: GPL-2.0 mit Classpath Exception\n";
  out += "Quelle: https://adoptium.net / https://github.com/adoptium/temurin17-binaries\n";
  out += "Publisher: Eclipse Adoptium (Eclipse Foundation)\n\n";
  out += "Die Classpath Exception erlaubt das Mitliefern dieser Java-Laufzeit, ohne dass\n";
  out += "dadurch der Rest der Anwendung unter die GPL faellt. Wird ausschliesslich als\n";
  out += "separater Prozess aufgerufen (nicht in den JS-Code eingebunden), um veraPDF\n";
  out += "(siehe unten) auszufuehren.\n\n";

  out += "----------------------------------------------------------------------\n";
  out += "veraPDF 1.30.2 (vendor/verapdf-runtime/verapdf/, nicht im Repository, per\n";
  out += "'npm run setup:verapdf' geladen und in den Installer gebuendelt)\n";
  out += "Lizenz: GPL-3.0-or-later ODER MPL-2.0-or-later (Wahl des Nutzers/Verteilers) —\n";
  out += "diese Anwendung verteilt veraPDF unter den Bedingungen der MPL-2.0-or-later.\n";
  out += "Quelle: https://github.com/veraPDF (u. a. veraPDF-apps, veraPDF-library, veraPDF-validation)\n";
  out += "Publisher: veraPDF Consortium (info@verapdf.org)\n\n";
  out += "Wird als eigenstaendiger Java-Prozess aufgerufen (kein Linking in den eigenen\n";
  out += "Code) fuer die optionale echte PDF/A-Konformitaetspruefung im PDF/A-Export-Dialog.\n";
  out += "Der Quellcode ist unveraendert und oeffentlich unter obiger Adresse verfuegbar.\n\n";

  fs.writeFileSync(outputPath, out);
  console.log("THIRD-PARTY-LICENSES.txt geschrieben:", keys.length, "Pakete");
});
