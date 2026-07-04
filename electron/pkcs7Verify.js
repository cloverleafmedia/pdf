// Verifies a detached PKCS#7/CMS signature (as embedded in a PDF's /Contents
// signature dictionary) against the exact bytes that were signed.
//
// node-forge (already a project dependency, used by @signpdf/signer-p12 for
// *signing*) only implements PKCS#7 *signing* - its own verify() is an
// unimplemented stub ("PKCS#7 signature verification not yet implemented"),
// and the SignedData/SignerInfo ASN.1 reading path in node-forge's own
// pkcs7.js never actually decodes individual SignerInfo fields (it only
// pulls out embedded certificates; msg.signerInfos is left empty, and the
// _signerFromAsn1 helper that theoretically would decode them is dead code -
// nothing calls it, and it references a validator, p7.asn1.signerInfoValidator,
// that pkcs7asn1.js doesn't even export).
//
// So this file hand-decodes each SignerInfo using forge's low-level asn1
// validate/capture API, with a schema copied from forge's own (internal,
// unexported) SignerInfo definition in pkcs7asn1.js - same field order/tags,
// just written out here since it isn't reachable via forge's public API.
// Correctness is established empirically via pkcs7Verify.test.js, which
// round-trips against forge's own signer (sign with forge, verify with this
// file), rather than by trusting any of the above dead code as a reference.
const forge = require('node-forge')

const { asn1, pki } = forge

const signerInfoValidator = {
  name: 'SignerInfo',
  tagClass: asn1.Class.UNIVERSAL,
  type: asn1.Type.SEQUENCE,
  constructed: true,
  value: [{
    name: 'SignerInfo.version',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.INTEGER,
    constructed: false,
  }, {
    name: 'SignerInfo.issuerAndSerialNumber',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE,
    constructed: true,
    value: [{
      name: 'SignerInfo.issuerAndSerialNumber.issuer',
      tagClass: asn1.Class.UNIVERSAL,
      type: asn1.Type.SEQUENCE,
      constructed: true,
    }, {
      name: 'SignerInfo.issuerAndSerialNumber.serialNumber',
      tagClass: asn1.Class.UNIVERSAL,
      type: asn1.Type.INTEGER,
      constructed: false,
      capture: 'serial',
    }],
  }, {
    name: 'SignerInfo.digestAlgorithm',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE,
    constructed: true,
    value: [{
      name: 'SignerInfo.digestAlgorithm.algorithm',
      tagClass: asn1.Class.UNIVERSAL,
      type: asn1.Type.OID,
      constructed: false,
      capture: 'digestAlgorithm',
    }, {
      name: 'SignerInfo.digestAlgorithm.parameter',
      tagClass: asn1.Class.UNIVERSAL,
      constructed: false,
      optional: true,
    }],
  }, {
    name: 'SignerInfo.authenticatedAttributes',
    tagClass: asn1.Class.CONTEXT_SPECIFIC,
    type: 0,
    constructed: true,
    optional: true,
    captureAsn1: 'authenticatedAttributesAsn1',
  }, {
    name: 'SignerInfo.digestEncryptionAlgorithm',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.SEQUENCE,
    constructed: true,
    value: [{
      name: 'SignerInfo.digestEncryptionAlgorithm.algorithm',
      tagClass: asn1.Class.UNIVERSAL,
      type: asn1.Type.OID,
      constructed: false,
      capture: 'signatureAlgorithm',
    }, {
      name: 'SignerInfo.digestEncryptionAlgorithm.parameter',
      tagClass: asn1.Class.UNIVERSAL,
      constructed: false,
      optional: true,
    }],
  }, {
    name: 'SignerInfo.encryptedDigest',
    tagClass: asn1.Class.UNIVERSAL,
    type: asn1.Type.OCTETSTRING,
    constructed: false,
    capture: 'signature',
  }, {
    name: 'SignerInfo.unauthenticatedAttributes',
    tagClass: asn1.Class.CONTEXT_SPECIFIC,
    type: 1,
    constructed: true,
    optional: true,
  }],
}

function toBinaryString(bytes) {
  return Buffer.from(bytes).toString('binary')
}

// cmsDerBytes: the raw DER bytes from the PDF's /Contents hex string.
// signedContentBytes: exactly the bytes covered by /ByteRange (the file's
// content with the /Contents placeholder itself excluded).
function verifyDetachedSignature(cmsDerBytes, signedContentBytes) {
  try {
    const contentInfoAsn1 = asn1.fromDer(forge.util.createBuffer(toBinaryString(cmsDerBytes)))

    const ciCapture = {}
    if (!asn1.validate(contentInfoAsn1, forge.pkcs7.asn1.contentInfoValidator, ciCapture, [])) {
      return { valid: false, supported: false, reason: 'ContentInfo konnte nicht gelesen werden' }
    }
    if (asn1.derToOid(ciCapture.contentType) !== pki.oids.signedData) {
      return { valid: false, supported: false, reason: 'Kein PKCS#7 SignedData' }
    }

    const signedDataAsn1 = ciCapture.content.value[0]
    const sdCapture = {}
    if (!asn1.validate(signedDataAsn1, forge.pkcs7.asn1.signedDataValidator, sdCapture, [])) {
      return { valid: false, supported: false, reason: 'SignedData konnte nicht gelesen werden' }
    }

    const certs = []
    if (sdCapture.certificates) {
      for (const certAsn1 of sdCapture.certificates.value) {
        try { certs.push(pki.certificateFromAsn1(certAsn1)) } catch { /* skip non-certificate entries */ }
      }
    }

    const signerInfoNodes = sdCapture.signerInfos || []
    if (!signerInfoNodes.length) {
      return { valid: false, supported: false, reason: 'Keine Signer-Informationen gefunden' }
    }

    // This app's own signing flow (and the overwhelming majority of
    // real-world PDF signatures) has exactly one SignerInfo per CMS blob -
    // each PDF /Sig dict already maps 1:1 to one call here via
    // findSignatureDicts, so only the first SignerInfo is verified.
    const siCapture = {}
    if (!asn1.validate(signerInfoNodes[0], signerInfoValidator, siCapture, [])) {
      return { valid: false, supported: false, reason: 'SignerInfo konnte nicht gelesen werden' }
    }

    const digestOid = asn1.derToOid(siCapture.digestAlgorithm)
    const sigOid = asn1.derToOid(siCapture.signatureAlgorithm)
    const digestName = pki.oids[digestOid]
    if (!digestName || !forge.md[digestName]) {
      return { valid: false, supported: false, reason: `Hash-Algorithmus nicht unterstützt (OID ${digestOid})` }
    }
    if (sigOid !== pki.oids.rsaEncryption) {
      return { valid: false, supported: false, reason: 'Signaturalgorithmus nicht unterstützt (nur RSA/PKCS#1v1.5)' }
    }

    const serialHex = forge.util.createBuffer(siCapture.serial).toHex()
    const cert = certs.find(c => c.serialNumber.toLowerCase() === serialHex.toLowerCase())
    if (!cert) {
      return { valid: false, supported: true, reason: 'Zertifikat des Unterzeichners nicht im Dokument gefunden' }
    }

    const contentDigest = forge.md[digestName].create()
    contentDigest.update(toBinaryString(signedContentBytes))
    const contentDigestBytes = contentDigest.digest().bytes()

    let digestToVerify
    if (siCapture.authenticatedAttributesAsn1) {
      // RFC 2315 9.3: the [0] IMPLICIT attributes are hashed+signed as a
      // universal SET (tag 0x31), not in their [0] IMPLICIT form - re-tag
      // before DER-re-encoding.
      const attrsAsn1 = siCapture.authenticatedAttributesAsn1
      const reTagged = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrsAsn1.value)
      const attrsDer = asn1.toDer(reTagged).getBytes()

      const messageDigestAttr = attrsAsn1.value.find(attr => {
        const oidNode = attr.value?.[0]
        return oidNode && asn1.derToOid(oidNode.value) === pki.oids.messageDigest
      })
      const embeddedDigest = messageDigestAttr?.value?.[1]?.value?.[0]?.value
      if (embeddedDigest !== contentDigestBytes) {
        return { valid: false, supported: true, reason: 'Message-Digest in signierten Attributen stimmt nicht mit dem Dokumentinhalt überein' }
      }

      const attrsDigest = forge.md[digestName].create()
      attrsDigest.update(attrsDer)
      digestToVerify = attrsDigest.digest().bytes()
    } else {
      digestToVerify = contentDigestBytes
    }

    let valid = false
    try {
      valid = cert.publicKey.verify(digestToVerify, siCapture.signature, 'RSASSA-PKCS1-V1_5')
    } catch {
      valid = false
    }

    return {
      valid,
      supported: true,
      algorithm: `${digestName.toUpperCase()} + RSA`,
      certificate: {
        subjectCN: cert.subject.getField('CN')?.value || '',
        issuerCN:  cert.issuer.getField('CN')?.value || '',
        notBefore: cert.validity.notBefore,
        notAfter:  cert.validity.notAfter,
      },
    }
  } catch (e) {
    return { valid: false, supported: false, reason: 'Signatur konnte nicht geparst werden: ' + e.message }
  }
}

module.exports = { verifyDetachedSignature }
