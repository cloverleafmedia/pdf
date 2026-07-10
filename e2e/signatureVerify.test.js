// "Signatur prüfen" end-to-end, using a real PDF signed via the same
// @signpdf/signer-p12 pipeline electron/main.js's own signPdf() uses - not a
// hand-rolled CMS blob - so this exercises the exact real-world shape
// (fixed-size /Contents placeholder padded with trailing zero bytes) that
// unit tests feeding verifyDetachedSignature exact, unpadded DER bytes
// never did. That gap previously meant the feature failed to even PARSE any
// signature this app's own "Signatur erstellen" produced - see the
// `parseAllBytes: false` fix and its regression test in pkcs7Verify.test.js.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import forge from 'node-forge'
import { PDFDocument } from 'pdf-lib'
import { plainAddPlaceholder } from '@signpdf/placeholder-plain'
import signpdfPkg from '@signpdf/signpdf'
import { P12Signer } from '@signpdf/signer-p12'
import { launchApp, openPdf } from './helpers.js'

const signpdf = signpdfPkg.default || signpdfPkg

let ctx

beforeAll(async () => {
  ctx = await launchApp()
}, 30000)

afterAll(async () => {
  await ctx?.close()
})

function makeSelfSignedP12(commonName) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2024-01-01')
  cert.validity.notAfter = new Date('2030-01-01')
  const attrs = [{ name: 'commonName', value: commonName }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'testpass', { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary')
}

async function makeSignedPdf(commonName) {
  const p12Bytes = makeSelfSignedP12(commonName)
  const doc = await PDFDocument.create()
  doc.addPage([300, 300])
  const classicBytes = await doc.save({ useObjectStreams: false })
  const pdfWithPlaceholder = plainAddPlaceholder({ pdfBuffer: Buffer.from(classicBytes), reason: 'Test', name: '', location: '' })
  const signer = new P12Signer(p12Bytes, { passphrase: 'testpass' })
  return Buffer.from(await signpdf.sign(pdfWithPlaceholder, signer))
}

async function runVerify(window, pdfBytes) {
  const p = path.join(os.tmpdir(), `cloverleaf-e2e-sigverify-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  fs.writeFileSync(p, pdfBytes)
  try {
    await openPdf(window, p)
    await window.locator('button[title="Dokument"]').click()
    await window.waitForTimeout(200)
    await window.getByText('Signatur prüfen', { exact: true }).click()
    await window.waitForTimeout(600)
    await window.getByRole('button', { name: /Signaturen prüfen/ }).click()
    await window.waitForTimeout(1500)
    return await window.locator('body').innerText()
  } finally { fs.unlinkSync(p) }
}

describe('Signatur prüfen', () => {
  it('parses and cryptographically verifies a real @signpdf-produced signature, and flags the untrusted self-signed issuer', async () => {
    const signed = await makeSignedPdf('Deutsche Bank AG (nicht echt)')
    const bodyText = await runVerify(ctx.window, signed)

    // Must reach the actual crypto/chain result, not the generic parse-failure
    // fallback ("Nicht unterstützter Algorithmus") the padding bug produced.
    expect(bodyText).toContain('Deutsche Bank AG (nicht echt)')
    expect(bodyText).toContain('Kryptografisch gültig')
    expect(bodyText).toContain('Aussteller nicht vertrauenswürdig')
    expect(bodyText).not.toContain('Nicht unterstützter Algorithmus')
    // A green, unqualified "Gültige Signatur, vertrauenswürdiges Zertifikat"
    // must never appear for a self-signed certificate claiming to be a bank.
    expect(bodyText).not.toContain('Gültige Signatur, vertrauenswürdiges Zertifikat')
  }, 30000)

  // Tamper detection itself (flipping signed bytes -> valid:false) is
  // already covered thoroughly at the unit level in pkcs7Verify.test.js,
  // including against the same padded/real-world CMS shape this file's
  // other test exercises - hand-corrupting a real PDF's bytes here too
  // risks producing a file malformed enough to hang pdf.js's own renderer,
  // which would be testing PDF parser robustness, not this feature.
})
