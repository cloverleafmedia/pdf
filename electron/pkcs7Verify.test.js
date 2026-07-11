import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import { verifyDetachedSignature, verifyTrustChain, buildOrderedChain } from './pkcs7Verify.js'

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

function makeCert({ subjectCN, issuerCN, issuerKey, notBefore, notAfter, serialNumber, isCA }) {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = serialNumber
  cert.validity.notBefore = notBefore || new Date('2024-01-01')
  cert.validity.notAfter = notAfter || new Date('2030-01-01')
  cert.setSubject([{ name: 'commonName', value: subjectCN }])
  cert.setIssuer([{ name: 'commonName', value: issuerCN }])
  if (isCA) {
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
    ])
  }
  cert.sign(issuerKey || keys.privateKey, forge.md.sha256.create())
  return { cert, privateKey: keys.privateKey }
}

// root (self-signed CA) -> intermediate (CA) -> leaf (end-entity signer) -
// a realistic 3-tier chain, the shape a real signing certificate usually has.
function makeCertChain(overrides = {}) {
  const root = makeCert({ subjectCN: 'Test Root CA', issuerCN: 'Test Root CA', serialNumber: '01', isCA: true })
  const intermediate = makeCert({ subjectCN: 'Test Intermediate CA', issuerCN: 'Test Root CA', issuerKey: root.privateKey, serialNumber: '02', isCA: true })
  const leaf = makeCert({ subjectCN: 'Leaf Signer', issuerCN: 'Test Intermediate CA', issuerKey: intermediate.privateKey, serialNumber: '03', ...overrides })
  return { root, intermediate, leaf }
}

function signDetached(contentBytes, cert, privateKey, { includeCert = true } = {}) {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(Buffer.from(contentBytes).toString('binary'))
  if (includeCert) p7.addCertificate(cert)
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

// Reaches into an otherwise-valid CMS blob and swaps one AlgorithmIdentifier's
// OID (digestAlgorithm at SignerInfo field index 2, digestEncryptionAlgorithm
// at index 4 - true whenever authenticatedAttributes is present, which
// signDetached() above always sets) or the encryptedDigest bytes (index 5) -
// used to exercise the "algorithm not supported" / "signature is malformed"
// branches that a hand-crafted-from-scratch ASN.1 tree would be much more
// work to reach, without ever touching the module under test's own logic.
function patchSignerInfo(cmsDerBytes, fieldIndex, newValueAsn1) {
  const { asn1 } = forge
  const obj = asn1.fromDer(forge.util.createBuffer(cmsDerBytes.toString('binary')))
  const ciCapture = {}
  asn1.validate(obj, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])
  const sdCapture = {}
  asn1.validate(ciCapture.content.value[0], forge.pkcs7.asn1.signedDataValidator, sdCapture, [])
  const signerInfo = sdCapture.signerInfos[0]
  signerInfo.value[fieldIndex] = newValueAsn1
  return Buffer.from(asn1.toDer(obj).getBytes(), 'binary')
}

function oidAlgorithmIdentifier(oid) {
  const { asn1 } = forge
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
  ])
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
    // Cryptographically valid, but a self-signed test cert obviously isn't
    // one of the ~150 real trusted roots - the crypto check passing must
    // not be conflated with the certificate's identity being trustworthy.
    expect(result.chainTrust.trusted).toBe(false)
    expect(result.chainTrust.selfSigned).toBe(true)
  })

  // Regression: a real PDF's /Contents is a FIXED-SIZE hex string reserved
  // before signing (@signpdf and every other real-world signer does this,
  // including this app's own "Signatur erstellen"), so the actual CMS/DER
  // bytes are followed by trailing zero-padding out to that reserved size.
  // forge's DER parser rejects trailing bytes by default - without
  // `parseAllBytes: false`, this made verifyDetachedSignature fail to parse
  // (and therefore never reach crypto/chain verification for) essentially
  // every real-world signed PDF, while every test here kept passing because
  // signDetached() above hands it exact, unpadded bytes.
  it('verifies a signature whose CMS bytes are followed by trailing zero-padding, matching a real /Contents placeholder', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('hello world, this is the signed PDF byte-range content')
    const cms = signDetached(content, cert, privateKey)
    const padded = Buffer.concat([cms, Buffer.alloc(8192 - cms.length, 0)])

    const result = verifyDetachedSignature(padded, content)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(true)
    expect(result.certificate.subjectCN).toBe('Test Signer')
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

  it('reports unsupported for a digest algorithm forge has no hash implementation for', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('content')
    const cms = signDetached(content, cert, privateKey)
    // An arbitrary made-up OID: pki.oids has no reverse mapping for it, so
    // digestName comes back undefined - the same real-world shape as a PDF
    // signed with a digest algorithm this app has never heard of.
    const patched = patchSignerInfo(cms, 2, oidAlgorithmIdentifier('1.2.3.4.5.6'))

    const result = verifyDetachedSignature(patched, content)
    expect(result.supported).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/Hash-Algorithmus nicht unterstützt/)
  })

  it('reports unsupported for a non-RSA signature algorithm (e.g. ECDSA)', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('content')
    const cms = signDetached(content, cert, privateKey)
    const patched = patchSignerInfo(cms, 4, oidAlgorithmIdentifier('1.2.840.10045.4.3.2')) // ecdsa-with-SHA256

    const result = verifyDetachedSignature(patched, content)
    expect(result.supported).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/Signaturalgorithmus nicht unterstützt/)
  })

  it("reports the signer's certificate as missing when it wasn't embedded in the CMS", () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('content')
    const cms = signDetached(content, cert, privateKey, { includeCert: false })

    const result = verifyDetachedSignature(cms, content)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/nicht im Dokument gefunden/)
  })

  it('treats an undecryptable/malformed signature value as invalid instead of throwing', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('content')
    const cms = signDetached(content, cert, privateKey)
    // A 3-byte "RSA signature" can't be a valid PKCS#1v1.5 block for a
    // 1024-bit key - forge's rsa.decrypt throws on the length mismatch
    // rather than returning false, which is exactly why verifyDetachedSignature
    // wraps the verify() call in its own try/catch.
    const { asn1 } = forge
    const bogusSignature = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, '\x01\x02\x03')
    const patched = patchSignerInfo(cms, 5, bogusSignature)

    const result = verifyDetachedSignature(patched, content)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(false)
  })
})

describe('buildOrderedChain', () => {
  it('orders leaf -> intermediate -> root regardless of the input array order', () => {
    const { root, intermediate, leaf } = makeCertChain()
    const scrambled = [root.cert, intermediate.cert] // leaf passed separately, as the real caller does
    const chain = buildOrderedChain(leaf.cert, scrambled)
    expect(chain).toEqual([leaf.cert, intermediate.cert, root.cert])
  })

  it('stops at whatever issuer is missing from the embedded set, without throwing', () => {
    const { intermediate, leaf } = makeCertChain()
    // root deliberately omitted - simulates a signer that only embedded the intermediate
    const chain = buildOrderedChain(leaf.cert, [intermediate.cert])
    expect(chain).toEqual([leaf.cert, intermediate.cert])
  })

  it('returns just the leaf for a self-signed certificate', () => {
    const { cert } = makeSelfSignedCert()
    expect(buildOrderedChain(cert, [cert])).toEqual([cert])
  })
})

describe('verifyTrustChain', () => {
  it('trusts a leaf whose chain resolves to a root present in the CA store', () => {
    const { root, intermediate, leaf } = makeCertChain()
    const caStore = forge.pki.createCaStore([root.cert])
    const result = verifyTrustChain(leaf.cert, [intermediate.cert, root.cert], caStore)
    expect(result.trusted).toBe(true)
    expect(result.selfSigned).toBe(false)
  })

  it('does not trust the same chain when its root is not in the CA store', () => {
    const { intermediate, leaf } = makeCertChain()
    const unrelatedRoot = makeCert({ subjectCN: 'Unrelated CA', issuerCN: 'Unrelated CA', serialNumber: '99', isCA: true })
    const caStore = forge.pki.createCaStore([unrelatedRoot.cert])
    const result = verifyTrustChain(leaf.cert, [intermediate.cert], caStore)
    expect(result.trusted).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('does not trust a self-signed certificate even against an empty CA store', () => {
    const { cert } = makeSelfSignedCert()
    const caStore = forge.pki.createCaStore([])
    const result = verifyTrustChain(cert, [cert], caStore)
    expect(result.trusted).toBe(false)
    expect(result.selfSigned).toBe(true)
  })

  it('does not trust a chain whose leaf certificate has expired', () => {
    const { root, intermediate, leaf } = makeCertChain({
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2021-01-01'), // expired long before "now"
    })
    const caStore = forge.pki.createCaStore([root.cert])
    const result = verifyTrustChain(leaf.cert, [intermediate.cert, root.cert], caStore)
    expect(result.trusted).toBe(false)
  })

  it('uses the real bundled trusted-root store by default (no caStore argument)', () => {
    const { cert } = makeSelfSignedCert()
    const result = verifyTrustChain(cert, [cert])
    expect(result.trusted).toBe(false) // a freshly generated test cert is never one of the real ~150 roots
  })
})
