// Shared "Speichern unter"-Dialog + Schreiben-Muster für terminale Aktionen
// (Verschlüsseln, Signieren, Reparieren, …), die immer in eine neue Datei
// schreiben statt das offene Dokument zu ersetzen. Gibt den gewählten Pfad
// zurück, oder null wenn der Dialog abgebrochen wurde.
export async function saveAsNewFile(defaultName, bytes) {
  const res = await window.api?.savePDF(defaultName)
  if (res?.canceled || !res?.filePath) return null
  await window.api?.writeFile(res.filePath, bytes)
  return res.filePath
}
