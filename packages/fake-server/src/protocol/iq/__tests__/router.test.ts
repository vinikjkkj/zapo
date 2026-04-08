import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../../transport/codec'
import { buildIqError, buildIqResult, WaFakeIqRouter } from '../router'

function buildGetIq(
    overrides: Partial<{ id: string; xmlns: string; to: string; childTag: string }> = {}
): BinaryNode {
    return {
        tag: 'iq',
        attrs: {
            id: overrides.id ?? 'iq-1',
            type: 'get',
            xmlns: overrides.xmlns ?? 'usync',
            to: overrides.to ?? 's.whatsapp.net'
        },
        content: [{ tag: overrides.childTag ?? 'usync', attrs: {} }]
    }
}

test('routes IQ to first matching handler', async () => {
    const router = new WaFakeIqRouter()
    let invoked = ''

    router.register({
        matcher: { xmlns: 'privacy' },
        respond: (iq) => {
            invoked = 'privacy'
            return buildIqResult(iq)
        }
    })
    router.register({
        matcher: { xmlns: 'usync' },
        respond: (iq) => {
            invoked = 'usync'
            return buildIqResult(iq)
        }
    })

    const response = await router.route(buildGetIq())
    assert.equal(invoked, 'usync')
    assert.equal(response?.tag, 'iq')
    assert.equal(response?.attrs.type, 'result')
    assert.equal(response?.attrs.id, 'iq-1')
    assert.equal(response?.attrs.from, 's.whatsapp.net')
})

test('falls through to onUnhandled when no matcher fits', async () => {
    const router = new WaFakeIqRouter()
    let unhandled: BinaryNode | null = null
    router.setEvents({
        onUnhandled: (iq) => {
            unhandled = iq
        }
    })

    router.register({
        matcher: { xmlns: 'something_else' },
        respond: (iq) => buildIqResult(iq)
    })

    const response = await router.route(buildGetIq({ xmlns: 'usync' }))
    assert.equal(response, null)
    assert.notEqual(unhandled, null)
    assert.equal((unhandled as BinaryNode | null)?.attrs.xmlns, 'usync')
})

test('matchers can constrain by type', async () => {
    const router = new WaFakeIqRouter()
    let setHits = 0
    let getHits = 0

    router.register({
        matcher: { xmlns: 'usync', type: 'set' },
        respond: (iq) => {
            setHits += 1
            return buildIqResult(iq)
        }
    })
    router.register({
        matcher: { xmlns: 'usync', type: 'get' },
        respond: (iq) => {
            getHits += 1
            return buildIqResult(iq)
        }
    })

    await router.route(buildGetIq())
    assert.equal(getHits, 1)
    assert.equal(setHits, 0)
})

test('matchers can constrain by child tag', async () => {
    const router = new WaFakeIqRouter()
    const seen: string[] = []

    router.register({
        matcher: { xmlns: 'usync', childTag: 'usync' },
        respond: (iq) => {
            seen.push('usync')
            return buildIqResult(iq)
        }
    })

    await router.route(buildGetIq({ childTag: 'usync' }))
    await router.route(buildGetIq({ childTag: 'other' }))
    assert.deepEqual(seen, ['usync'])
})

test('register returns an unsubscribe function', async () => {
    const router = new WaFakeIqRouter()
    let calls = 0
    const unsubscribe = router.register({
        matcher: { xmlns: 'usync' },
        respond: (iq) => {
            calls += 1
            return buildIqResult(iq)
        }
    })

    await router.route(buildGetIq())
    assert.equal(calls, 1)

    unsubscribe()
    await router.route(buildGetIq())
    assert.equal(calls, 1, 'handler should not be called after unsubscribe')
})

test('non-iq stanzas are ignored', async () => {
    const router = new WaFakeIqRouter()
    let unhandled: BinaryNode | null = null
    router.setEvents({ onUnhandled: (iq) => (unhandled = iq) })

    router.register({
        matcher: { xmlns: 'usync' },
        respond: (iq) => buildIqResult(iq)
    })

    const response = await router.route({
        tag: 'message',
        attrs: { id: 'm-1' }
    })

    assert.equal(response, null)
    assert.equal(unhandled, null)
})

test('buildIqResult requires an id on the inbound stanza', () => {
    assert.throws(() => buildIqResult({ tag: 'iq', attrs: {} }), /without an id/)
})

test('buildIqError emits an error child with code', () => {
    const inbound = buildGetIq()
    const error = buildIqError(inbound, { code: 401, text: 'unauthorized' })
    assert.equal(error.attrs.type, 'error')
    assert.equal(error.attrs.id, 'iq-1')
    assert.ok(Array.isArray(error.content))
    const errChild = (error.content as BinaryNode[])[0]
    assert.equal(errChild.tag, 'error')
    assert.equal(errChild.attrs.code, '401')
    assert.equal(errChild.attrs.text, 'unauthorized')
})
