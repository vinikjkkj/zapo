import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaProxyTransport } from '@transport/types'
import { fetchLatestWaWebVersion } from '@transport/wa-web-version-fetcher'

function makeFetchStub(
    handler: (url: string, init: RequestInit) => Promise<Response> | Response
): typeof fetch {
    return (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) =>
        handler(typeof input === 'string' ? input : input.toString(), init)) as typeof fetch
}

test('fetchLatestWaWebVersion parses client_revision and returns versioned result', async () => {
    let seenUrl = ''
    let seenHeaders: Headers | undefined
    const fetchStub = makeFetchStub((url, init) => {
        seenUrl = url
        seenHeaders = new Headers(init.headers)
        return new Response('{"client_revision":1040229458,"x":1}', { status: 200 })
    })

    const result = await fetchLatestWaWebVersion({ fetch: fetchStub })

    assert.equal(seenUrl, 'https://web.whatsapp.com/sw.js')
    assert.equal(seenHeaders?.get('sec-fetch-site'), 'none')
    assert.match(seenHeaders?.get('user-agent') ?? '', /Mozilla/)
    assert.equal(result.version, '2.3000.1040229458')
    assert.deepEqual(result.parts, [2, 3000, 1040229458])
})

test('fetchLatestWaWebVersion accepts escaped client_revision form', async () => {
    const fetchStub = makeFetchStub(
        () => new Response('var x = "\\"client_revision\\":   42 ,"', { status: 200 })
    )
    const result = await fetchLatestWaWebVersion({ fetch: fetchStub })
    assert.equal(result.version, '2.3000.42')
})

test('fetchLatestWaWebVersion forwards user-agent override and extra headers', async () => {
    let seenHeaders: Headers | undefined
    const fetchStub = makeFetchStub((_url, init) => {
        seenHeaders = new Headers(init.headers)
        return new Response('"client_revision":1', { status: 200 })
    })

    await fetchLatestWaWebVersion({
        fetch: fetchStub,
        userAgent: 'custom-ua/1.0',
        headers: { 'X-Trace': 'abc' }
    })

    assert.equal(seenHeaders?.get('user-agent'), 'custom-ua/1.0')
    assert.equal(seenHeaders?.get('x-trace'), 'abc')
})

test('fetchLatestWaWebVersion forwards dispatcher when proxy is a dispatcher', async () => {
    let seenDispatcher: unknown
    const fetchStub = makeFetchStub((_url, init) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response('"client_revision":7', { status: 200 })
    })
    const dispatcher = { dispatch: () => undefined }

    await fetchLatestWaWebVersion({ fetch: fetchStub, proxy: dispatcher })
    assert.equal(seenDispatcher, dispatcher)
})

test('fetchLatestWaWebVersion ignores agent-shaped proxy (fetch only takes dispatcher)', async () => {
    let seenDispatcher: unknown = 'unset'
    const fetchStub = makeFetchStub((_url, init) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response('"client_revision":7', { status: 200 })
    })
    const agent = { addRequest: () => undefined } as unknown as WaProxyTransport

    await fetchLatestWaWebVersion({ fetch: fetchStub, proxy: agent })
    assert.equal(seenDispatcher, undefined)
})

test('fetchLatestWaWebVersion throws on non-2xx response', async () => {
    const fetchStub = makeFetchStub(() => new Response('nope', { status: 503 }))
    await assert.rejects(() => fetchLatestWaWebVersion({ fetch: fetchStub }), /http 503/)
})

test('fetchLatestWaWebVersion throws when client_revision is absent', async () => {
    const fetchStub = makeFetchStub(() => new Response('no revision here', { status: 200 }))
    await assert.rejects(
        () => fetchLatestWaWebVersion({ fetch: fetchStub }),
        /client_revision not found/
    )
})

test('fetchLatestWaWebVersion wraps network failures', async () => {
    const fetchStub = makeFetchStub(() => {
        throw new Error('boom')
    })
    await assert.rejects(
        () => fetchLatestWaWebVersion({ fetch: fetchStub }),
        /failed to fetch sw\.js: boom/
    )
})

function hangingFetchStub(): typeof fetch {
    return ((_input: Parameters<typeof fetch>[0], init: RequestInit = {}) =>
        new Promise<Response>((resolve, reject) => {
            // ref'd timer keeps the event loop alive so the source's
            // unref'd timeout (or external abort) can fire under node:test.
            const guard = setTimeout(() => resolve(new Response('"client_revision":1')), 5_000)
            init.signal?.addEventListener(
                'abort',
                () => {
                    clearTimeout(guard)
                    reject(init.signal?.reason ?? new Error('aborted'))
                },
                { once: true }
            )
        })) as typeof fetch
}

test('fetchLatestWaWebVersion times out when fetch hangs', async () => {
    await assert.rejects(
        () => fetchLatestWaWebVersion({ fetch: hangingFetchStub(), timeoutMs: 25 }),
        /timed out after 25ms/
    )
})

test('fetchLatestWaWebVersion honors external abort signal', async () => {
    const controller = new AbortController()
    const pending = fetchLatestWaWebVersion({
        fetch: hangingFetchStub(),
        signal: controller.signal
    })
    controller.abort(new Error('user-cancelled'))
    await assert.rejects(pending, /user-cancelled/)
})
