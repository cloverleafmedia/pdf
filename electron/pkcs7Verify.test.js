import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import { verifyDetachedSignature } from './pkcs7Verify.js'

// Round-trips against forge's own SignedData signer (the same forge API
// @signpdf/signer-p12 uses under the hood, see node_modules/@signpdf/signer-p12/dist/P12Signer.js)
// rather than trusting forge's own (dead/unreachable) reading code as a reference.

function makeSelfSignedCert() {
  const keys = forge.pki.rsa.generateKeyPair(1024) // small key size purely for test speed
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2024-01-01')
  cert.validity.notAfter = new Date('2030-01-01')
  const attrs = [{ name: 'commonName', value: 'Test Signer' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { cert, privateKey: keys.privateKey }
}

function signDetached(contentBytes, cert, privateKey) {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(Buffer.from(contentBytes).toString('binary'))
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.signingTime, value: new Date('2024-06-01') },
      { type: forge.pki.oids.messageDigest },
    ],
  })
  p7.sign({ detached: true })
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
}

describe('verifyDetachedSignature', () => {
  it("verifies a signature produced by forge's own signer (round-trip)", () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('hello world, this is the signed PDF byte-range content')
    const cms = signDetached(content, cert, privateKey)

    const result = verifyDetachedSignature(cms, content)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(true)
    expect(result.certificate.subjectCN).toBe('Test Signer')
    expect(result.algorithm).toBe('SHA256 + RSA')
  })

  it('detects tampering: verification fails if the signed content changes after signing', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('original content, exact same length')
    const cms = signDetached(content, cert, privateKey)

    const tampered = Buffer.from('original CONTENT, exact same length')
    const result = verifyDetachedSignature(cms, tampered)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('reports unsupported (not a crash) for a non-SignedData ContentInfo', () => {
    const bogus = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(forge.pki.oids.data).getBytes()),
    ])
    const der = Buffer.from(forge.asn1.toDer(bogus).getBytes(), 'binary')
    const result = verifyDetachedSignature(der, Buffer.from('anything'))
    expect(result.supported).toBe(false)
    expect(result.valid).toBe(false)
  })

  it('gracefully reports a parse failure for garbage input instead of throwing', () => {
    const result = verifyDetachedSignature(Buffer.from([0x00, 0x01, 0x02]), Buffer.from('x'))
    expect(result.valid).toBe(false)
    expect(result.supported).toBe(false)
    expect(result.reason).toBeTruthy()
  })
})
