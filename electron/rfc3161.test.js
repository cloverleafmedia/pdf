import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import {
  extractSignatureValue,
  buildTimeStampRequest,
  parseTimeStampResponse,
  augmentSignerInfoWithTimestamp,
  parseEmbeddedTimestamp,
  requestTimestamp,
  OID_SIGNATURE_TIMESTAMP_TOKEN,
} from './rfc3161.js'
import { verifyDetachedSignature } from './pkcs7Verify.js'

const { asn1 } = forge

// Same round-trip-against-forge's-own-signer approach as pkcs7Verify.test.js,
// reused here as both a source of a real CMS to augment and a stand-in for a
// TSA's own "timeStampToken" (itself just another CMS SignedData).
function makeSelfSignedCert(commonName = 'Test Signer') {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2024-01-01')
  cert.validity.notAfter = new Date('2030-01-01')
  const attrs = [{ name: 'commonName', value: commonName }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  // setSubject/setIssuer must happen before sign() - forge bakes the subject
  // into the signed tbsCertificate at sign time, a later setSubject() call
  // only updates the in-memory JS object, not what actually gets serialized.
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

function makeFixtureTimeStampTokenAsn1() {
  const { cert, privateKey } = makeSelfSignedCert()
  const cms = signDetached(Buffer.from('dummy TSA response content'), cert, privateKey)
  return asn1.fromDer(forge.util.createBuffer(cms.toString('binary')))
}

// A real (embedded, not detached) CMS SignedData whose eContent is an actual
// TSTInfo DER structure with a known genTime - unlike
// makeFixtureTimeStampTokenAsn1() above (arbitrary dummy content, fine for
// testing the TSQ/TSR plumbing but not genTime extraction), this is what a
// real TSA response's timeStampToken looks like.
function makeFixtureTimeStampTokenWithGenTime(genTimeDate, tsaCN = 'Test TSA') {
  const { cert, privateKey } = makeSelfSignedCert(tsaCN)

  const messageImprint = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'x'.repeat(32)),
  ])
  const tstInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.3.4.5').getBytes()), // dummy policy OID
    messageImprint,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.GENERALIZEDTIME, false, asn1.dateToGeneralizedTime(genTimeDate)),
  ])
  const tstInfoDer = asn1.toDer(tstInfo).getBytes()

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tstInfoDer) // embedded, not detached
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
    ],
  })
  p7.sign()
  const cms = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
  return asn1.fromDer(forge.util.createBuffer(cms.toString('binary')))
}

function buildFixtureTsr(status, timeStampTokenAsn1) {
  const statusInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(status).getBytes()),
  ])
  const children = [statusInfo]
  if (timeStampTokenAsn1) children.push(timeStampTokenAsn1)
  const tsr = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children)
  return Buffer.from(asn1.toDer(tsr).getBytes(), 'binary')
}

describe('extractSignatureValue', () => {
  it('extracts the raw RSA signature value (encryptedDigest) from a CMS blob', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const cms = signDetached(Buffer.from('some content'), cert, privateKey)
    const sig = extractSignatureValue(cms)
    expect(Buffer.isBuffer(sig)).toBe(true)
    expect(sig.length).toBe(128) // 1024-bit RSA signature = 128 bytes
  })
})

describe('buildTimeStampRequest', () => {
  it('produces a well-formed TSQ with version 1, the SHA-256 OID, and the given hash', () => {
    const hash = Buffer.from('0'.repeat(64), 'hex') // 32 zero bytes, stand-in SHA-256 digest
    const tsq = buildTimeStampRequest(hash, { nonce: 42, certReq: true })
    const obj = asn1.fromDer(forge.util.createBuffer(tsq.toString('binary')))

    const validator = {
      name: 'TimeStampReq', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true,
      value: [
        { name: 'version', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.INTEGER, constructed: false, capture: 'version' },
        {
          name: 'messageImprint', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true,
          value: [
            { name: 'hashAlgorithm', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true, captureAsn1: 'hashAlgorithmAsn1' },
            { name: 'hashedMessage', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.OCTETSTRING, constructed: false, capture: 'hashedMessage' },
          ],
        },
        { name: 'nonce', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.INTEGER, constructed: false, capture: 'nonce' },
        { name: 'certReq', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.BOOLEAN, constructed: false, capture: 'certReq' },
      ],
    }
    const capture = {}
    expect(asn1.validate(obj, validator, capture, [])).toBe(true)
    expect(asn1.derToInteger(capture.version)).toBe(1)
    expect(asn1.derToOid(capture.hashAlgorithmAsn1.value[0].value)).toBe('2.16.840.1.101.3.4.2.1')
    expect(Buffer.from(capture.hashedMessage, 'binary').equals(hash)).toBe(true)
    expect(asn1.derToInteger(capture.nonce)).toBe(42)
    expect(capture.certReq.charCodeAt(0)).not.toBe(0) // TRUE
  })

  it('omits certReq when explicitly disabled', () => {
    const tsq = buildTimeStampRequest(Buffer.alloc(32), { certReq: false })
    const obj = asn1.fromDer(forge.util.createBuffer(tsq.toString('binary')))
    // version + messageImprint + nonce = 3 children, no certReq
    expect(obj.value.length).toBe(3)
  })
})

describe('parseTimeStampResponse', () => {
  it('returns the timeStampToken for a granted (status 0) response', () => {
    const tokenAsn1 = makeFixtureTimeStampTokenAsn1()
    const tsr = buildFixtureTsr(0, tokenAsn1)
    const result = parseTimeStampResponse(tsr)
    expect(result.status).toBe(0)
    expect(result.timeStampTokenAsn1).toBeTruthy()
  })

  it('accepts grantedWithMods (status 1)', () => {
    const tsr = buildFixtureTsr(1, makeFixtureTimeStampTokenAsn1())
    expect(parseTimeStampResponse(tsr).status).toBe(1)
  })

  it.each([2, 3, 4, 5])('throws a clear German error for status %i', (status) => {
    const tsr = buildFixtureTsr(status, null)
    expect(() => parseTimeStampResponse(tsr)).toThrow()
  })

  it('throws if status is granted but no timeStampToken is present', () => {
    const tsr = buildFixtureTsr(0, null)
    expect(() => parseTimeStampResponse(tsr)).toThrow(/keinen Zeitstempel-Token/)
  })

  it('throws a clean parse error for malformed input instead of crashing', () => {
    expect(() => parseTimeStampResponse(Buffer.from([0x00, 0x01, 0x02]))).toThrow()
  })
})

describe('augmentSignerInfoWithTimestamp', () => {
  it('embeds the timestamp token without disturbing the original signature (verified via verifyDetachedSignature)', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('the exact bytes covered by /ByteRange')
    const cms = signDetached(content, cert, privateKey)

    const tokenAsn1 = makeFixtureTimeStampTokenAsn1()
    const augmented = augmentSignerInfoWithTimestamp(cms, tokenAsn1)

    // Bigger (a whole nested CMS token was appended) but still a valid,
    // unchanged signature over the same content - proves the augmentation
    // only appends the unauthenticated attribute and doesn't touch anything
    // that's part of the signed/hashed data.
    expect(augmented.length).toBeGreaterThan(cms.length)
    const result = verifyDetachedSignature(augmented, content)
    expect(result.supported).toBe(true)
    expect(result.valid).toBe(true)
    expect(result.certificate.subjectCN).toBe('Test Signer')
  })

  it('embeds the attribute under the signature-timestamp-token OID', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const cms = signDetached(Buffer.from('content'), cert, privateKey)
    const augmented = augmentSignerInfoWithTimestamp(cms, makeFixtureTimeStampTokenAsn1())

    const obj = asn1.fromDer(forge.util.createBuffer(augmented.toString('binary')))
    const ciCapture = {}
    asn1.validate(obj, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])
    const sdCapture = {}
    asn1.validate(ciCapture.content.value[0], forge.pkcs7.asn1.signedDataValidator, sdCapture, [])
    const signerInfo = sdCapture.signerInfos[0]
    const unauthNode = signerInfo.value[signerInfo.value.length - 1]
    expect(unauthNode.tagClass).toBe(asn1.Class.CONTEXT_SPECIFIC)
    expect(unauthNode.type).toBe(1)
    const attribute = unauthNode.value[0]
    expect(asn1.derToOid(attribute.value[0].value)).toBe(OID_SIGNATURE_TIMESTAMP_TOKEN)
  })
})

describe('parseEmbeddedTimestamp', () => {
  function wrapAsUnauthenticatedAttributes(tokenAsn1) {
    const attributeNode = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SIGNATURE_TIMESTAMP_TOKEN).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [tokenAsn1]),
    ])
    return asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [attributeNode])
  }

  it('extracts genTime and the TSA certificate CN from a real timestamp token', () => {
    const genTime = new Date('2026-03-15T10:30:00Z')
    const tokenAsn1 = makeFixtureTimeStampTokenWithGenTime(genTime, 'Example TSA GmbH')
    const unauthAttrsAsn1 = wrapAsUnauthenticatedAttributes(tokenAsn1)

    const result = parseEmbeddedTimestamp(unauthAttrsAsn1)
    expect(result).toBeTruthy()
    expect(result.genTime.toISOString()).toBe(genTime.toISOString())
    expect(result.tsaName).toBe('Example TSA GmbH')
  })

  it('returns null when there is no unauthenticatedAttributes node at all', () => {
    expect(parseEmbeddedTimestamp(undefined)).toBeNull()
    expect(parseEmbeddedTimestamp(null)).toBeNull()
  })

  it('returns null instead of throwing when the token wraps content that is not valid TSTInfo DER', () => {
    // makeFixtureTimeStampTokenAsn1() signs a plain dummy string, not a real
    // TSTInfo structure - past the outer ContentInfo/SignedData shape checks,
    // asn1.fromDer() on that eContent throws. Exercises the catch-all safety
    // net so a TSA (or attacker) that embeds a malformed/foreign timestamp
    // token degrades to "no timestamp" instead of crashing signature display.
    const tokenAsn1 = makeFixtureTimeStampTokenAsn1()
    const unauthAttrsAsn1 = wrapAsUnauthenticatedAttributes(tokenAsn1)
    expect(parseEmbeddedTimestamp(unauthAttrsAsn1)).toBeNull()
  })

  it('returns null when unauthenticatedAttributes is present but has no timestamp-token attribute', () => {
    const otherAttribute = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.3.4').getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, []),
    ])
    const unauthAttrsAsn1 = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [otherAttribute])
    expect(parseEmbeddedTimestamp(unauthAttrsAsn1)).toBeNull()
  })

  it('full round-trip: a signature timestamped via augmentSignerInfoWithTimestamp reports the correct genTime through verifyDetachedSignature', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('content covered by /ByteRange')
    const cms = signDetached(content, cert, privateKey)

    const genTime = new Date('2025-11-20T08:00:00Z')
    const tokenAsn1 = makeFixtureTimeStampTokenWithGenTime(genTime, 'Round-Trip TSA')
    const augmented = augmentSignerInfoWithTimestamp(cms, tokenAsn1)

    const result = verifyDetachedSignature(augmented, content)
    expect(result.valid).toBe(true)
    expect(result.timestamp).toBeTruthy()
    expect(result.timestamp.genTime.toISOString()).toBe(genTime.toISOString())
    expect(result.timestamp.tsaName).toBe('Round-Trip TSA')
  })

  it('a signature without a timestamp has no `timestamp` field (existing signatures unaffected)', () => {
    const { cert, privateKey } = makeSelfSignedCert()
    const content = Buffer.from('plain, never-timestamped content')
    const cms = signDetached(content, cert, privateKey)

    const result = verifyDetachedSignature(cms, content)
    expect(result.valid).toBe(true)
    expect(result.timestamp).toBeUndefined()
  })
})

describe('requestTimestamp', () => {
  it('builds a TSQ, posts it via the injected transport, and returns the parsed token', async () => {
    const tokenAsn1 = makeFixtureTimeStampTokenAsn1()
    const fixtureTsr = buildFixtureTsr(0, tokenAsn1)
    let receivedUrl, receivedBody
    const postFn = async (url, body) => { receivedUrl = url; receivedBody = body; return fixtureTsr }

    const result = await requestTimestamp('http://example-tsa.invalid', Buffer.alloc(32, 7), postFn)
    expect(receivedUrl).toBe('http://example-tsa.invalid')
    expect(Buffer.isBuffer(receivedBody)).toBe(true)
    expect(result.status).toBe(0)
    expect(result.timeStampTokenAsn1).toBeTruthy()
  })

  it('propagates a transport failure (offline/unreachable TSA) as a clear rejection, without hanging', async () => {
    const postFn = async () => { throw new Error('connect ETIMEDOUT') }
    await expect(requestTimestamp('http://example-tsa.invalid', Buffer.alloc(32), postFn)).rejects.toThrow('ETIMEDOUT')
  })
})
