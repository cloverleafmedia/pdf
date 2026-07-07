// RFC 3161 trusted timestamping for the existing PKCS#7/CMS PDF signature flow
// (see electron/main.js's signPdf() and electron/pkcs7Verify.js). Lets a
// signature stay provably valid even after the signer's certificate expires,
// by having a Time-Stamp Authority (TSA) counter-sign the signature value
// itself and embedding that as an unsigned ("unauthenticated") attribute.
//
// No RFC 3161 client library exists in this project's dependencies - hand-rolled
// with node-forge's generic ASN.1 primitives (asn1.create/toDer/fromDer/oidToDer/
// integerToDer/validate), the same low-level toolkit electron/pkcs7Verify.js
// already uses to hand-decode CMS SignerInfo (forge's own PKCS#7 reading path
// is dead code - see the comment at the top of that file). This module is
// deliberately electron-independent (no `require('electron')`) so it stays
// unit-testable the same way, per pkcs7Verify.test.js's round-trip pattern -
// the actual HTTP transport to the TSA is injected by the caller (main.js),
// not performed here.
const forge = require('node-forge')

const { asn1, pki } = forge

const OID_SHA256 = '2.16.840.1.101.3.4.2.1'
const OID_SIGNATURE_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14'

// PKIStatus values (RFC 3161 §2.4.2) mapped to German error text for statuses
// that mean "no usable timestamp token" - granted(0)/grantedWithMods(1) are
// the only ones that come with a token worth embedding.
const STATUS_MESSAGES = {
  2: 'Der Zeitstempel-Server hat die Anfrage abgelehnt.',
  3: 'Der Zeitstempel-Server verarbeitet die Anfrage noch (waiting).',
  4: 'Das Zertifikat des Zeitstempel-Servers läuft bald ab (revocationWarning).',
  5: 'Das Zertifikat des Zeitstempel-Servers wurde zurückgezogen (revocationNotification).',
}

function toBinaryString(bytes) {
  return Buffer.from(bytes).toString('binary')
}

// TimeStampReq ::= SEQUENCE { version INTEGER(1), messageImprint SEQUENCE
//   { hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING },
//   nonce INTEGER OPTIONAL, certReq BOOLEAN DEFAULT FALSE }
// (reqPolicy/extensions omitted - optional, no TSA-specific policy needed here)
function buildTimeStampRequest(hashBytes, { nonce, certReq = true } = {}) {
  const hashAlgorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SHA256).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ])
  const messageImprint = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    hashAlgorithm,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, toBinaryString(hashBytes)),
  ])

  // forge.asn1.integerToDer throws above 32-bit values, so the nonce is kept
  // within signed-31-bit range - it's a pure request/response correlation
  // value, not a security boundary, so the reduced entropy doesn't matter.
  const nonceValue = nonce ?? Math.floor(Math.random() * 0x7fffffff)

  const seqValues = [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    messageImprint,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(nonceValue).getBytes()),
  ]
  if (certReq) {
    seqValues.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)))
  }

  const tsq = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, seqValues)
  return Buffer.from(asn1.toDer(tsq).getBytes(), 'binary')
}

// Minimal SignerInfo schema that only cares about extracting encryptedDigest
// (the actual RSA signature value) - RFC 3161/CAdES-T's signature-time-stamp
// attribute is defined to timestamp exactly this value, never the original
// document hash. A fuller schema (with authenticatedAttributes etc.) already
// exists in electron/pkcs7Verify.js for verification; this one is deliberately
// narrower since that's all this module needs.
const signatureValueValidator = {
  name: 'SignerInfo',
  tagClass: asn1.Class.UNIVERSAL,
  type: asn1.Type.SEQUENCE,
  constructed: true,
  value: [
    { name: 'version', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.INTEGER, constructed: false },
    { name: 'issuerAndSerialNumber', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true },
    { name: 'digestAlgorithm', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true },
    { name: 'authenticatedAttributes', tagClass: asn1.Class.CONTEXT_SPECIFIC, type: 0, constructed: true, optional: true },
    { name: 'digestEncryptionAlgorithm', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true },
    { name: 'encryptedDigest', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.OCTETSTRING, constructed: false, capture: 'signature' },
  ],
}

// Extracts the raw RSA signature value (SignerInfo.encryptedDigest) from a
// CMS/PKCS#7 SignedData blob, e.g. one just produced by @signpdf/signpdf.
function extractSignatureValue(cmsDerBytes) {
  const contentInfoAsn1 = asn1.fromDer(forge.util.createBuffer(toBinaryString(cmsDerBytes)))
  const ciCapture = {}
  if (!asn1.validate(contentInfoAsn1, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])) {
    throw new Error('ContentInfo der Signatur konnte nicht gelesen werden.')
  }
  const sdCapture = {}
  if (!asn1.validate(ciCapture.content.value[0], forge.pkcs7.asn1.signedDataValidator, sdCapture, [])) {
    throw new Error('SignedData der Signatur konnte nicht gelesen werden.')
  }
  const signerInfoNodes = sdCapture.signerInfos || []
  if (!signerInfoNodes.length) {
    throw new Error('Keine Signer-Informationen in der Signatur gefunden.')
  }
  const siCapture = {}
  if (!asn1.validate(signerInfoNodes[0], signatureValueValidator, siCapture, [])) {
    throw new Error('SignerInfo der Signatur konnte nicht gelesen werden.')
  }
  return Buffer.from(siCapture.signature, 'binary')
}

const timeStampRespValidator = {
  name: 'TimeStampResp',
  tagClass: asn1.Class.UNIVERSAL,
  type: asn1.Type.SEQUENCE,
  constructed: true,
  value: [{
    name: 'TimeStampResp.status',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE,
    constructed: true,
    captureAsn1: 'statusInfoAsn1',
  }, {
    name: 'TimeStampResp.timeStampToken',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE, // TimeStampToken ::= ContentInfo, itself a SEQUENCE
    constructed: true,
    optional: true,
    captureAsn1: 'timeStampTokenAsn1',
  }],
}

// derBytes: the raw TimeStampResp bytes returned by the TSA.
// Returns { status, timeStampTokenAsn1 } - throws with a German message for
// any status/parse failure that leaves no usable token.
function parseTimeStampResponse(derBytes) {
  let obj
  try {
    obj = asn1.fromDer(forge.util.createBuffer(toBinaryString(derBytes)))
  } catch (e) {
    throw new Error('Antwort des Zeitstempel-Servers konnte nicht gelesen werden: ' + e.message)
  }

  const capture = {}
  if (!asn1.validate(obj, timeStampRespValidator, capture, [])) {
    throw new Error('Antwort des Zeitstempel-Servers hat ein unerwartetes Format.')
  }

  const status = asn1.derToInteger(capture.statusInfoAsn1.value[0].value)
  if (status !== 0 && status !== 1) {
    throw new Error(STATUS_MESSAGES[status] || `Unbekannter Zeitstempel-Status (${status}).`)
  }
  if (!capture.timeStampTokenAsn1) {
    throw new Error('Die Antwort des Zeitstempel-Servers enthält keinen Zeitstempel-Token.')
  }

  return { status, timeStampTokenAsn1: capture.timeStampTokenAsn1 }
}

// Appends the timestamp token as an unauthenticatedAttributes ([1] IMPLICIT
// SET OF Attribute) entry on the CMS's (first) SignerInfo, and re-encodes the
// whole SignedData back to DER. Note: forge's own _signerToAsn1/_attributeToAsn1
// (pkcs7.js) can't be reused here - they have a real bug (`.values.push`
// instead of `.value`) and only special-case 3 known attribute types - so the
// Attribute/unauthenticatedAttributes nodes are hand-built from scratch.
function augmentSignerInfoWithTimestamp(cmsDerBytes, timeStampTokenAsn1) {
  const contentInfoAsn1 = asn1.fromDer(forge.util.createBuffer(toBinaryString(cmsDerBytes)))

  const ciCapture = {}
  if (!asn1.validate(contentInfoAsn1, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])) {
    throw new Error('ContentInfo der Signatur konnte nicht gelesen werden.')
  }
  const signedDataAsn1 = ciCapture.content.value[0]
  const sdCapture = {}
  if (!asn1.validate(signedDataAsn1, forge.pkcs7.asn1.signedDataValidator, sdCapture, [])) {
    throw new Error('SignedData der Signatur konnte nicht gelesen werden.')
  }

  const signerInfoNodes = sdCapture.signerInfos || []
  if (!signerInfoNodes.length) {
    throw new Error('Keine Signer-Informationen in der Signatur gefunden.')
  }
  // Same "exactly one SignerInfo" assumption electron/pkcs7Verify.js already
  // makes - this app's own signing flow never produces more than one.
  const signerInfoNode = signerInfoNodes[0]

  const attributeNode = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SIGNATURE_TIMESTAMP_TOKEN).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [timeStampTokenAsn1]),
  ])
  const unauthenticatedAttributesNode = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [attributeNode])
  // signerInfoNode.value is the live child array of the parsed tree (asn1.validate's
  // `capture` assigns the node's own .value, not a copy - confirmed against
  // node-forge's pkcs7asn1.js/asn1.js) - pushing here and re-serializing the
  // top-level contentInfoAsn1 below reflects the mutation correctly.
  signerInfoNode.value.push(unauthenticatedAttributesNode)

  return Buffer.from(asn1.toDer(contentInfoAsn1).getBytes(), 'binary')
}

// Minimal TSTInfo schema (RFC 3161 §2.4.2) - only genTime is needed for
// display, so later optional fields (accuracy/ordering/nonce/tsa/extensions)
// are deliberately left out of the schema; forge's validate doesn't require
// the schema to cover every trailing child of the actual SEQUENCE.
const tstInfoValidator = {
  name: 'TSTInfo',
  tagClass: asn1.Class.UNIVERSAL,
  type: asn1.Type.SEQUENCE,
  constructed: true,
  value: [
    { name: 'version', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.INTEGER, constructed: false },
    { name: 'policy', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.OID, constructed: false },
    { name: 'messageImprint', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.SEQUENCE, constructed: true },
    { name: 'serialNumber', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.INTEGER, constructed: false },
    { name: 'genTime', tagClass: asn1.Class.UNIVERSAL, type: asn1.Type.GENERALIZEDTIME, constructed: false, capture: 'genTime' },
  ],
}

// Reverse of augmentSignerInfoWithTimestamp(): given a SignerInfo's already-
// parsed unauthenticatedAttributesAsn1 node (see pkcs7Verify.js), finds the
// signature-timestamp-token attribute (if present) and extracts the
// timestamp's genTime + the TSA's own certificate CN (present because our own
// TSQ always sends certReq: true) for display in "Signatur prüfen". Returns
// null if no timestamp attribute is present or it can't be parsed - callers
// treat that exactly like "this signature was never timestamped".
function parseEmbeddedTimestamp(unauthAttrsAsn1) {
  if (!unauthAttrsAsn1?.value) return null
  try {
    for (const attribute of unauthAttrsAsn1.value) {
      const oidNode = attribute.value?.[0]
      if (!oidNode || asn1.derToOid(oidNode.value) !== OID_SIGNATURE_TIMESTAMP_TOKEN) continue

      const valuesSetNode = attribute.value[1]
      const tokenContentInfoAsn1 = valuesSetNode?.value?.[0]
      if (!tokenContentInfoAsn1) return null

      const ciCapture = {}
      if (!asn1.validate(tokenContentInfoAsn1, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])) return null
      const tokenSignedDataAsn1 = ciCapture.content?.value?.[0]
      if (!tokenSignedDataAsn1) return null

      const sdCapture = {}
      if (!asn1.validate(tokenSignedDataAsn1, forge.pkcs7.asn1.signedDataValidator, sdCapture, [])) return null

      // TSTInfo bytes live in the timestamp token's own encapContentInfo.eContent
      // ([0] EXPLICIT OCTET STRING) - unlike a detached PDF signature, a
      // timestamp token's content is NOT detached, it's embedded right here.
      const tstInfoOctetStringNode = sdCapture.content?.value?.[0]
      if (!tstInfoOctetStringNode) return null

      const tstInfoAsn1 = asn1.fromDer(forge.util.createBuffer(tstInfoOctetStringNode.value))
      const tstCapture = {}
      if (!asn1.validate(tstInfoAsn1, tstInfoValidator, tstCapture, [])) return null
      const genTime = tstCapture.genTime ? asn1.generalizedTimeToDate(tstCapture.genTime) : null

      let tsaName = null
      if (sdCapture.certificates?.value?.length) {
        try {
          const cert = pki.certificateFromAsn1(sdCapture.certificates.value[0])
          tsaName = cert.subject.getField('CN')?.value || null
        } catch (_) { /* TSA cert missing/unparseable - genTime alone is still useful */ }
      }

      return { genTime, tsaName }
    }
  } catch (_) {
    return null
  }
  return null
}

// Orchestrates: build TSQ for hashBytes -> POST via the injected transport ->
// parse TSR. `postFn(url, tsqDerBytes) => Promise<Buffer>` performs the actual
// HTTP request - injected so this module stays electron-independent/testable;
// electron/main.js supplies the real Electron net.request-based implementation.
async function requestTimestamp(tsaUrl, hashBytes, postFn) {
  const tsq = buildTimeStampRequest(hashBytes)
  const responseBytes = await postFn(tsaUrl, tsq)
  return parseTimeStampResponse(responseBytes)
}

module.exports = {
  extractSignatureValue,
  buildTimeStampRequest,
  parseTimeStampResponse,
  augmentSignerInfoWithTimestamp,
  parseEmbeddedTimestamp,
  requestTimestamp,
  OID_SIGNATURE_TIMESTAMP_TOKEN,
}
