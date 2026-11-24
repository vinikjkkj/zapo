import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { type BinaryNode, WA_BUSINESS_AGENT, type WaClient } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import { buildStreamErrorCode } from '../protocol/stream/stream-error'

import { createZapoClient } from './helpers/zapo-client'

function waitForOpen(client: WaClient): Promise<void> {
    return new Promise((resolve, reject) => {
        const listener = (event: { readonly status: string }) => {
            if (event.status !== 'open') return
            clearTimeout(timer)
            client.off('connection', listener)
            resolve()
        }
        const timer = setTimeout(() => {
            client.off('connection', listener)
            reject(new Error('Business Agent flow connection timeout'))
        }, 10_000)
        client.on('connection', listener)
    })
}

test(
    'Business Agent QR flow uses private SMB authentication, real HTTP and fresh auth after reconnect',
    { timeout: 30_000 },
    async (t) => {
        const server = await FakeWaServer.start()
        let nonceRequests = 0
        let exchanges = 0
        let httpRequests = 0
        const publicNodes: BinaryNode[] = []
        const publicFrames: Uint8Array[] = []
        let responseStatus = 'ENABLED'
        let holdNextRequest: (() => void) | null = null
        const http = createServer(async (request, response) => {
            let body = ''
            for await (const chunk of request) body += String(chunk)
            const envelope = JSON.parse(body) as {
                access_token: string
                doc_id: string
                variables: { input?: { status: string } }
            }
            assert.equal(envelope.access_token, `flow-token-${exchanges}`)
            httpRequests += 1
            if (holdNextRequest) {
                const started = holdNextRequest
                holdNextRequest = null
                response.writeHead(200, { 'Content-Type': 'application/json' })
                response.write('{"data":')
                started()
                return
            }
            if (envelope.doc_id === WA_BUSINESS_AGENT.DOCUMENTS.updateSettings) {
                responseStatus = envelope.variables.input?.status ?? responseStatus
                response.end(
                    JSON.stringify({
                        data: {
                            xfb_meta_ai_biz_agent_wa_update_response_settings_v2: { success: true }
                        }
                    })
                )
            } else {
                assert.equal(envelope.doc_id, WA_BUSINESS_AGENT.DOCUMENTS.settings)
                response.end(
                    JSON.stringify({
                        data: {
                            xfb_meta_ai_biz_agent_wa_fetch_response_settings_v2: {
                                status: responseStatus,
                                audience_rules: [{ selector_type: 'ALL', mode: 'MUTED' }]
                            }
                        }
                    })
                )
            }
        })
        http.listen(0, '127.0.0.1')
        await once(http, 'listening')
        const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/graphql`
        const originalFetch = globalThis.fetch
        t.mock.method(
            globalThis,
            'fetch',
            (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
                assert.equal(input, WA_BUSINESS_AGENT.ENDPOINT)
                return originalFetch(url, init)
            }
        )
        const { client } = createZapoClient(server, { sessionId: 'business-agent-flow' })
        server.registerIqHandler(
            { xmlns: 'fb:thrift_iq', type: 'get' },
            async (iq, context): Promise<BinaryNode> => {
                const attrs = { id: iq.attrs.id, type: 'result', from: 's.whatsapp.net' }
                if (iq.attrs.smax_id === '118') {
                    nonceRequests += 1
                    assert.ok(context)
                    // Deliberately arrives before the IQ response, through the real Noise stream.
                    await context.connection.sendStanza({
                        tag: 'notification',
                        attrs: {
                            id: `nonce-${nonceRequests}`,
                            type: 'business',
                            from: 's.whatsapp.net'
                        },
                        content: [
                            {
                                tag: 'wa_ad_account_nonce',
                                attrs: {},
                                content: `flow-nonce-${nonceRequests}`
                            }
                        ]
                    })
                    return {
                        tag: 'iq',
                        attrs,
                        content: [{ tag: 'result', attrs: { status: 'Success' } }]
                    }
                }
                assert.equal(iq.attrs.smax_id, '104')
                const parameters = iq.content as BinaryNode[]
                const code = (parameters[0].content as BinaryNode[])[0]
                assert.equal(
                    new TextDecoder().decode(code.content as Uint8Array),
                    `flow-nonce-${nonceRequests}`
                )
                exchanges += 1
                return {
                    tag: 'iq',
                    attrs,
                    content: [
                        { tag: 'business_person', attrs: { id: '12345' } },
                        { tag: 'access_token', attrs: {}, content: `flow-token-${exchanges}` },
                        { tag: 'session_cookies', attrs: {}, content: '[]' }
                    ]
                }
            }
        )
        client.on('debug_transport_node_in', ({ node }) => publicNodes.push(node))
        client.on('debug_transport_node_out', ({ node }) => publicNodes.push(node))
        client.on('debug_transport_frame_in', ({ frame }) => publicFrames.push(frame))
        client.on('debug_transport_frame_out', ({ frame }) => publicFrames.push(frame))
        client.lowlevel.registerIncomingStanzaFilter((node) => {
            publicNodes.push(node)
            return false
        })
        const material = new Promise<ReturnType<typeof parsePairingQrString>>((resolve) =>
            client.once('auth_qr', ({ qr }) => resolve(parsePairingQrString(qr)))
        )
        try {
            await client.connect()
            const pipeline = await server.waitForAuthenticatedPipeline()
            const ready = waitForOpen(client)
            await server.runPairing(
                pipeline,
                { deviceJid: '15550000001:1@s.whatsapp.net' },
                () => material
            )
            await ready
            const settings = await Promise.all([
                client.businessAgent.getResponseSettings(),
                client.businessAgent.getResponseSettings()
            ])
            assert.equal(settings[0]?.status, 'ENABLED')
            assert.equal(nonceRequests, 1)
            assert.equal(exchanges, 1)
            assert.deepEqual(
                await client.businessAgent.updateResponseSettings({ status: 'MUTED' }),
                { outcome: 'accepted' }
            )
            assert.equal((await client.businessAgent.getResponseSettings())?.status, 'MUTED')
            await client.disconnect()
            await assert.rejects(client.businessAgent.getResponseSettings(), {
                code: 'not_connected'
            })
            await client.connect()
            assert.equal((await client.businessAgent.getResponseSettings())?.status, 'MUTED')
            assert.equal(nonceRequests, 2)
            assert.equal(exchanges, 2)
            assert.equal(httpRequests, 5)
            const currentPipeline = await server.waitForAuthenticatedPipeline()
            const restarted = waitForOpen(client)
            await currentPipeline.sendStanza(buildStreamErrorCode(515))
            await restarted
            assert.equal((await client.businessAgent.getResponseSettings())?.status, 'MUTED')
            assert.equal(nonceRequests, 3)
            assert.equal(exchanges, 3)
            const started = new Promise<void>((resolve) => {
                holdNextRequest = resolve
            })
            const pending = client.businessAgent.getResponseSettings()
            const cancelled = assert.rejects(pending, { code: 'identity_changed' })
            await started
            await client.disconnect()
            await cancelled
            const observed =
                JSON.stringify(publicNodes) +
                publicFrames.map((frame) => new TextDecoder().decode(frame)).join('')
            assert.doesNotMatch(observed, /flow-token-|flow-nonce-/)
        } finally {
            await client.disconnect()
            await server.stop()
            http.closeAllConnections()
            await new Promise<void>((resolve, reject) =>
                http.close((error) => (error ? reject(error) : resolve()))
            )
        }
    }
)
