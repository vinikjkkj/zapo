import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

function summarizeStanza(node: BinaryNode): string {
    const tag = node.tag
    const attrSummary = Object.entries(node.attrs)
        .filter(([key]) => ['type', 'xmlns', 'to', 'id'].includes(key))
        .map(([k, v]) => `${k}="${String(v)}"`)
        .join(' ')
    const firstChild =
        Array.isArray(node.content) && node.content.length > 0 ? node.content[0].tag : null
    const childPart = firstChild !== null ? ` <${firstChild}/>` : ''
    return `<${tag} ${attrSummary}>${childPart}</${tag}>`
}

test('capture: stanzas the client sends in the first 5s after success', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'capture' })

    const events: string[] = []
    client.on('connection', (event) => {
        events.push(`connection { status=${event.status}, reason=${String(event.reason)} }`)
    })
    client.on('connection_success', () => {
        events.push('connection_success')
    })

    try {
        await client.connect()
        await new Promise((resolve) => setTimeout(resolve, 5_000))
    } catch (error) {
        void error
    } finally {
        await client.disconnect().catch(() => undefined)
    }

    const captured = server.capturedStanzaSnapshot()
    await server.stop()

    console.log(`\n[capture] client emitted ${events.length} event(s):`)
    for (const evt of events) {
        console.log(`  - ${evt}`)
    }

    console.log(`[capture] client sent ${captured.length} stanza(s) post-success:`)
    for (let i = 0; i < captured.length; i += 1) {
        console.log(`  ${i + 1}. ${summarizeStanza(captured[i])}`)
    }
})
