import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { CallState, type WaVoipDeps } from '../../types.js'
import { WaCallManager } from '../WaCallManager.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import {
    buildOfferNode,
    CALL_KEY_ENC_NODE,
    callIdOf,
    createMockDeps,
    findByInnerTag,
    holdCallKeyDecrypt,
    holdDeviceSync,
    settle,
    tagsSentFor
} from './_call-manager-fixtures.js'

/** A client torn down mid-offer must not ring, dial or send anything for it afterwards. */
test('an offer that resumes after the manager is destroyed makes no call and sends nothing', async () => {
    for (const stage of ['decrypting', 'setting up'] as const) {
        const { deps, stores, sent } = createMockDeps()
        const release = stage === 'decrypting' ? holdCallKeyDecrypt(deps) : holdDeviceSync(deps)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const callId = 'CA11CA11000000000000000000000071'

        const offer = manager.handleCallOffer(
            buildOfferNode(callId, undefined, undefined, [CALL_KEY_ENC_NODE]),
            '2222222222@lid'
        )
        await settle()
        manager.destroy()
        release()
        await offer

        assert.equal(manager.getCall(callId), null, stage)
        assert.deepEqual(manager.getCalls(), [], stage)
        assert.deepEqual(tagsSentFor(sent, callId), [], stage)
    }
})

/** A client torn down while placing a call must not ring the peer for it afterwards. */
test('a call being placed when the manager is destroyed sends no offer and reports nothing', async (t) => {
    for (const stage of ['initMedia', 'buildOfferStanza'] as const) {
        const { deps, stores, sent } = createMockDeps()
        let release = (): void => {}
        if (stage === 'buildOfferStanza') {
            release = holdDeviceSync(deps)
        } else {
            const gate = new Promise<void>((resolve) => {
                release = resolve
            })
            const initMedia = WaCallMediaSession.prototype.initMedia
            t.mock.method(
                WaCallMediaSession.prototype,
                'initMedia',
                async function (this: WaCallMediaSession, selfLid: string, peerJid: string) {
                    await gate
                    return initMedia.call(this, selfLid, peerJid)
                }
            )
        }
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const emitted = recordEveryEmit(manager)

        const placing = manager.startCall({ peerJid: '2222222222@lid' })
        await settle()
        manager.destroy()
        release()

        await assert.rejects(placing, /destroyed/, stage)
        assert.deepEqual(findByInnerTag(sent, 'offer'), [], stage)
        assert.deepEqual(emitted, [], stage)
        assert.deepEqual(manager.getCalls(), [], stage)
        t.mock.restoreAll()
    }
})

/** Every event the manager emits, listened to or not. */
function recordEveryEmit(manager: WaCallManager): string[] {
    const emitted: string[] = []
    const emit = manager.emit.bind(manager)
    manager.emit = (event: string | symbol, ...args: unknown[]): boolean => {
        emitted.push(String(event))
        return emit(event, ...args)
    }
    return emitted
}

/** Holds the send of our offer open until released; `sent` records it as it leaves. */
function holdOfferSend(
    deps: WaVoipDeps,
    sent: BinaryNode[],
    failTerminate = false
): { offered: Promise<void>; release: () => void } {
    let release!: () => void
    let offeredNow!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const offered = new Promise<void>((resolve) => {
        offeredNow = resolve
    })
    const coordinator = deps.lowLevelCoordinator as unknown as {
        sendNode: (node: BinaryNode) => Promise<void>
    }
    coordinator.sendNode = async (node) => {
        sent.push(node)
        const tag = (node.content as BinaryNode[] | undefined)?.[0]?.tag
        if (tag === 'offer') {
            offeredNow()
            await gate
        }
        if (tag === 'terminate' && failTerminate) throw new Error('socket closing')
    }
    return { offered, release }
}

/** The offer left before `destroy` ran: the peer is ringing, and only a terminate stops it. */
test('an offer already sent when the manager is destroyed is withdrawn with a terminate', async () => {
    const { deps, stores, sent } = createMockDeps()
    const { offered, release } = holdOfferSend(deps, sent)
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const emitted = recordEveryEmit(manager)

    const placing = manager.startCall({ peerJid: '2222222222@lid' })
    await offered
    manager.destroy()
    release()

    await assert.rejects(placing, /destroyed/)
    const [offer] = findByInnerTag(sent, 'offer')
    assert.ok(offer)
    const callId = callIdOf(offer)
    assert.ok(callId)
    assert.deepEqual(tagsSentFor(sent, callId), ['offer', 'terminate'])
    const terminate = findByInnerTag(sent, 'terminate')[0]
    assert.equal(terminate.attrs.to, '2222222222@lid')
    assert.deepEqual((terminate.content as BinaryNode[])[0].attrs, {
        'call-id': callId,
        'call-creator': '1111111111@lid'
    })
    assert.deepEqual(emitted, [])
    assert.deepEqual(manager.getCalls(), [])
})

/** A logger whose warnings, its children's included, are kept with their bound context. */
function recordWarnings(
    bindings: Readonly<Record<string, unknown>> = {},
    warnings: Array<[string, Record<string, unknown>]> = []
): { logger: Logger; warnings: Array<[string, Record<string, unknown>]> } {
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message, context) => {
            warnings.push([message, { ...bindings, ...context }])
        },
        child: (more) => recordWarnings({ ...bindings, ...more }, warnings).logger
    }
    return { logger, warnings }
}

test('a withdrawing terminate that fails to send is logged, not thrown, and the call is cleaned up', async (t) => {
    const { deps, stores, sent } = createMockDeps()
    const { offered, release } = holdOfferSend(deps, sent, true)
    const cleanup = t.mock.method(WaCallMediaSession.prototype, 'cleanup')
    const { logger, warnings } = recordWarnings()
    const manager = new WaCallManager({ deps, stores, logger, maxConcurrentCalls: 1 })

    const placing = manager.startCall({ peerJid: '2222222222@lid' })
    await offered
    manager.destroy()
    const cleanedByDestroy = cleanup.mock.callCount()
    release()

    await assert.rejects(placing, /call manager destroyed/)
    const callId = callIdOf(findByInnerTag(sent, 'offer')[0])
    assert.equal(findByInnerTag(sent, 'terminate').length, 1)
    assert.deepEqual(warnings, [
        ['terminate of an offer sent during destroy failed', { callId, message: 'socket closing' }]
    ])
    assert.equal(cleanup.mock.callCount(), cleanedByDestroy + 1)
    assert.deepEqual(manager.getCalls(), [])
})

test('a call placed without a destroy sends its offer and no terminate', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })

    assert.deepEqual(tagsSentFor(sent, callId), ['offer'])
    assert.equal(manager.getCall(callId)?.stateData.state, CallState.Ringing)
})
