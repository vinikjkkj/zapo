import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyNoiseCertificateChain, type WaNoiseRootCa } from '../../../transport/codec'
import { X25519 } from '../../../transport/crypto'
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
