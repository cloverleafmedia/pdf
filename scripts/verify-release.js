// Prueft nach einem Publish, ob der GitHub-Release fuer die aktuelle Version
// wirklich funktionsfaehig ist - insbesondere den Bug vom 2026-07-04, bei dem
// zwei parallele "--publish always"-Laeufe zwei Release-Objekte mit demselben
// Tag anlegten und electron-updater dadurch mit 404 auf latest.yml/die .exe lief.
//
// Nutzung: node scripts/verify-release.js  (liest Version aus package.json)

const pkg = require("../package.json");

const OWNER = "cloverleafmedia";
const REPO = "pdf";
const version = pkg.version;
const tag = `v${version}`;

const requiredAssets = [
  `CloverleafPDF-Setup-${version}.exe`,
  `CloverleafPDF-Setup-${version}.exe.blockmap`,
  "latest.yml",
];

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log(`Pruefe GitHub-Release fuer Tag ${tag} ...`);

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=100`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) {
    fail(`GitHub-API-Abfrage fehlgeschlagen: HTTP ${res.status}`);
    return;
  }
  const releases = await res.json();
  const matches = releases.filter((r) => r.tag_name === tag);

  if (matches.length === 0) {
    fail(`Kein Release fuer Tag ${tag} gefunden.`);
    return;
  }
  if (matches.length > 1) {
    fail(
      `DUPLIKAT: ${matches.length} Release-Objekte fuer denselben Tag ${tag} gefunden ` +
        `(IDs: ${matches.map((r) => r.id).join(", ")}). Das ist exakt der Bug vom 2026-07-04 ` +
        `(zwei parallele --publish-Laeufe). Fix: alle bis auf eines per ` +
        `"DELETE /repos/${OWNER}/${REPO}/releases/{id}" loeschen, fehlende Assets beim ` +
        `verbleibenden Release nachladen, dann dieses Skript erneut laufen lassen.`
    );
    return;
  }

  const release = matches[0];
  console.log(`✓ Genau ein Release gefunden (ID ${release.id}).`);

  if (release.draft) fail(`Release ist ein Draft, nicht veroeffentlicht.`);
  if (release.prerelease) fail(`Release ist als Pre-Release markiert - electron-updater ignoriert das.`);

  const assetNames = new Set(release.assets.map((a) => a.name));
  for (const name of requiredAssets) {
    if (!assetNames.has(name)) {
      fail(`Asset fehlt im Release: ${name}`);
    } else {
      const asset = release.assets.find((a) => a.name === name);
      if (asset.state !== "uploaded") {
        fail(`Asset ${name} hat Status "${asset.state}" statt "uploaded".`);
      } else {
        console.log(`✓ Asset vorhanden: ${name} (${asset.size} Bytes)`);
      }
    }
  }

  if (process.exitCode === 1) return;

  console.log(`\nPruefe die "freundlichen" Download-URLs (das nutzt electron-updater) ...`);
  for (const name of requiredAssets) {
    const url = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
    const headRes = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (headRes.status !== 200) {
      fail(`Download-URL liefert HTTP ${headRes.status} statt 200: ${url}`);
    } else {
      console.log(`✓ 200 OK: ${name}`);
    }
  }

  if (process.exitCode === 1) {
    console.error(`\nRelease fuer ${tag} ist NICHT funktionsfaehig - electron-updater wird das Update nicht finden.`);
  } else {
    console.log(`\n✅ Release ${tag} ist vollstaendig und ueber electron-updater erreichbar.`);
  }
}

main().catch((err) => {
  fail(`Unerwarteter Fehler: ${err.message}`);
});
