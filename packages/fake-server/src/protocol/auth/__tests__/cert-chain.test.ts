import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyNoiseCertificateChain, type WaNoiseRootCa } from '../../../transport/codec'
import { X25519 } from '../../../transport/crypto'
import { proto } from '../../../transport/protos'
import { buildFakeCertChain, generateFakeNoiseRootCa } from '../cert-chain'

test('fake cert chain passes the lib verification using the matching root CA', async () => {
    const root = await generateFakeNoiseRootCa()
    const serverStaticKeyPair = await X25519.generateKeyPair()

    const { encoded } = await buildFakeCertChain({
        root,
        leafKey: serverStaticKeyPair.pubKey
    })

    const trustedRootCa: WaNoiseRootCa = {
        publicKey: root.publicKey,
        serial: root.serial
    }

    await verifyNoiseCertificateChain(encoded, serverStaticKeyPair.pubKey, trustedRootCa)
})

test('fake cert chain carries a currently-valid notBefore/notAfter window', async () => {
    const root = await generateFakeNoiseRootCa()
    const serverStaticKeyPair = await X25519.generateKeyPair()

    const { encoded } = await buildFakeCertChain({
        root,
        leafKey: serverStaticKeyPair.pubKey
    })

    const chain = proto.CertChain.decode(encoded)
    const nowSeconds = Math.floor(Date.now() / 1_000)
    const toSeconds = (value: number | { toNumber(): number } | null | undefined): number => {
        if (value === null || value === undefined) return 0
        return typeof value === 'number' ? value : value.toNumber()
    }
    for (const certificate of [chain.intermediate, chain.leaf]) {
        assert.ok(certificate?.details)
        const details = proto.CertChain.NoiseCertificate.Details.decode(certificate.details)
        const notBefore = toSeconds(details.notBefore)
        const notAfter = toSeconds(details.notAfter)
        assert.ok(notBefore > 0 && notBefore <= nowSeconds)
        assert.ok(notAfter > nowSeconds)
    }
})

test('cert chain verification rejects when leaf key does not match server static', async () => {
    const root = await generateFakeNoiseRootCa()
    const serverStaticKeyPair = await X25519.generateKeyPair()
    const wrongStaticKeyPair = await X25519.generateKeyPair()

    const { encoded } = await buildFakeCertChain({
        root,
        leafKey: serverStaticKeyPair.pubKey
    })

    await assert.rejects(
        () =>
            verifyNoiseCertificateChain(encoded, wrongStaticKeyPair.pubKey, {
                publicKey: root.publicKey,
                serial: root.serial
            }),
        /leaf certificate key mismatch/
    )
})

test('cert chain verification rejects when wrong root CA is supplied', async () => {
    const root = await generateFakeNoiseRootCa()
    const otherRoot = await generateFakeNoiseRootCa()
    const serverStaticKeyPair = await X25519.generateKeyPair()

    const { encoded } = await buildFakeCertChain({
        root,
        leafKey: serverStaticKeyPair.pubKey
    })

    await assert.rejects(
        () =>
            verifyNoiseCertificateChain(encoded, serverStaticKeyPair.pubKey, {
                publicKey: otherRoot.publicKey,
                serial: otherRoot.serial
            }),
        /intermediate certificate signature is invalid/
    )
})

test('cert chain verification rejects when issuer serial does not match root', async () => {
    const root = await generateFakeNoiseRootCa()
    const serverStaticKeyPair = await X25519.generateKeyPair()

    const { encoded } = await buildFakeCertChain({
        root,
        leafKey: serverStaticKeyPair.pubKey
    })

    await assert.rejects(
        () =>
            verifyNoiseCertificateChain(encoded, serverStaticKeyPair.pubKey, {
                publicKey: root.publicKey,
                serial: 9999
            }),
        /intermediate certificate issuer mismatch/
    )
})
