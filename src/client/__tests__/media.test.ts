import assert from 'node:assert/strict'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { Readable } from 'node:stream'
import test from 'node:test'

import { downloadMediaMessage } from '@client/media'
import type { WaIncomingMessageEvent } from '@client/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'

const key = new Uint8Array([1, 2, 3])

function fakeTransfer(
    onRequest: (req: Record<string, unknown>) => void,
    plaintext: Readable
): WaMediaTransferClient {
    return {
        downloadAndDecryptStream: (req: Record<string, unknown>) => {
            onRequest(req)
            return Promise.resolve({ plaintext, metadata: Promise.resolve({}) })
        }
    } as unknown as WaMediaTransferClient
}

test('downloadMediaMessage throws when the message has no downloadable media', async () => {
    await assert.rejects(
        () => downloadMediaMessage({ conversation: 'hi' }),
        /no downloadable media/
    )
})

test('downloadMediaMessage forwards the resolved payload to the transfer client', async () => {
    let captured: Record<string, unknown> | undefined
    const plaintext = Readable.from([new Uint8Array([9])])
    const transfer = fakeTransfer((req) => {
        captured = req
    }, plaintext)

    const result = await downloadMediaMessage(
        {
            imageMessage: {
                directPath: '/img',
                mediaKey: key,
                fileSha256: new Uint8Array([4]),
                fileEncSha256: new Uint8Array([5])
            }
        },
        { transfer, timeoutMs: 1234 }
    )

    assert.equal(result, plaintext)
    assert.equal(captured?.directPath, '/img')
    assert.equal(captured?.mediaType, 'image')
    assert.equal(captured?.mediaKey, key)
    assert.equal(captured?.timeoutMs, 1234)
    assert.equal(captured?.agent, undefined)
})

test('downloadMediaMessage forwards an http(s).Agent proxy as the request agent', async () => {
    for (const agent of [new HttpAgent(), new HttpsAgent()]) {
        let captured: Record<string, unknown> | undefined
        const transfer = fakeTransfer((req) => {
            captured = req
        }, Readable.from([]))

        await downloadMediaMessage(
            { imageMessage: { directPath: '/i', mediaKey: key } },
            { transfer, proxy: agent }
        )

        assert.equal(captured?.agent, agent)
    }
})

test('downloadMediaMessage ignores an undici-style dispatcher proxy', async () => {
    let captured: Record<string, unknown> | undefined
    const transfer = fakeTransfer((req) => {
        captured = req
    }, Readable.from([]))

    await downloadMediaMessage(
        { imageMessage: { directPath: '/i', mediaKey: key } },
        { transfer, proxy: { dispatch: () => undefined } }
    )

    assert.equal(captured?.agent, undefined)
})

test('downloadMediaMessage unwraps an incoming message event', async () => {
    let captured: Record<string, unknown> | undefined
    const plaintext = Readable.from([new Uint8Array([1])])
    const transfer = fakeTransfer((req) => {
        captured = req
    }, plaintext)

    const event = {
        rawNode: { tag: 'message', attrs: {} },
        message: { audioMessage: { directPath: '/a', mediaKey: key, ptt: true } }
    } as unknown as WaIncomingMessageEvent

    await downloadMediaMessage(event, { transfer })

    assert.equal(captured?.mediaType, 'ptt')
    assert.equal(captured?.directPath, '/a')
})
