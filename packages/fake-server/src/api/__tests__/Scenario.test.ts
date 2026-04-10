import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../transport/codec'
import { type AuthenticatedPipelineListener, Scenario, type ScenarioServer } from '../Scenario'

class StubServer implements ScenarioServer {
    public readonly handlers: Array<{
        readonly matcher: { readonly xmlns?: string; readonly type?: string }
        readonly respond: (iq: BinaryNode) => BinaryNode | Promise<BinaryNode>
        readonly label?: string
    }> = []
    public readonly authListeners: AuthenticatedPipelineListener[] = []

    public registerIqHandler(
        matcher: { readonly xmlns?: string; readonly type?: string },
        respond: (iq: BinaryNode) => BinaryNode | Promise<BinaryNode>,
        label?: string
    ): () => void {
        const entry = { matcher, respond, label }
        this.handlers.push(entry)
        return () => {
            const index = this.handlers.indexOf(entry)
            if (index >= 0) this.handlers.splice(index, 1)
        }
    }

    public onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void {
        this.authListeners.push(listener)
        return () => {
            const index = this.authListeners.indexOf(listener)
            if (index >= 0) this.authListeners.splice(index, 1)
        }
    }
}

const SAMPLE_IQ: BinaryNode = {
    tag: 'iq',
    attrs: { id: 'iq-1', type: 'get', xmlns: 'usync' }
}

test('onIq().respondWith registers a static handler', async () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    const response: BinaryNode = { tag: 'iq', attrs: { type: 'result', id: 'iq-1' } }
    scenario.onIq({ xmlns: 'usync' }).respondWith(response)

    assert.equal(stub.handlers.length, 1)
    const result = await stub.handlers[0].respond(SAMPLE_IQ)
    assert.equal(result, response)
})

test('onIq().respond receives the inbound stanza', async () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    let received: BinaryNode | null = null
    scenario.onIq({ xmlns: 'usync' }).respond((iq) => {
        received = iq
        return { tag: 'iq', attrs: { type: 'result', id: iq.attrs.id ?? '' } }
    })

    await stub.handlers[0].respond(SAMPLE_IQ)
    assert.equal(received, SAMPLE_IQ)
})

test('onIq().respondOnce removes itself after the first hit', async () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    const response: BinaryNode = { tag: 'iq', attrs: { type: 'result', id: 'iq-1' } }
    scenario.onIq({ xmlns: 'usync' }).respondOnce(response)

    assert.equal(stub.handlers.length, 1)
    await stub.handlers[0].respond(SAMPLE_IQ)
    assert.equal(stub.handlers.length, 0, 'one-shot handler should unregister itself')
})

test('respondOnce supports a dynamic responder function', async () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    let invocations = 0
    scenario.onIq({ xmlns: 'usync' }).respondOnce((iq) => {
        invocations += 1
        return { tag: 'iq', attrs: { type: 'result', id: iq.attrs.id ?? '' } }
    })

    await stub.handlers[0].respond(SAMPLE_IQ)
    assert.equal(invocations, 1)
    assert.equal(stub.handlers.length, 0)
})

test('afterAuth registers an authenticated-pipeline listener', () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    const noop = (): void => undefined
    scenario.afterAuth(noop)

    assert.equal(stub.authListeners.length, 1)
    assert.equal(stub.authListeners[0], noop)
})

test('multiple onIq calls register multiple handlers in order', () => {
    const stub = new StubServer()
    const scenario = new Scenario(stub)

    scenario.onIq({ xmlns: 'a' }).respondWith({ tag: 'iq', attrs: {} })
    scenario.onIq({ xmlns: 'b' }).respondWith({ tag: 'iq', attrs: {} })
    scenario.onIq({ xmlns: 'c' }).respondWith({ tag: 'iq', attrs: {} })

    assert.equal(stub.handlers.length, 3)
    assert.equal(stub.handlers[0].matcher.xmlns, 'a')
    assert.equal(stub.handlers[1].matcher.xmlns, 'b')
    assert.equal(stub.handlers[2].matcher.xmlns, 'c')
})
