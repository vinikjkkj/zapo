import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaProxyTransport } from '@transport/types'
import { fetchLatestWaMobileVersion, fetchLatestWaWebVersion } from '@transport/wa-version-fetcher'

function makeFetchStub(
    handler: (url: string, init: RequestInit) => Promise<Response> | Response
): typeof fetch {
    return async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) =>
        handler(typeof input === 'string' ? input : input.toString(), init)
}

function hangingFetchStub(bodyOnResolve: string): typeof fetch {
    return (_input: Parameters<typeof fetch>[0], init: RequestInit = {}) =>
        new Promise<Response>((resolve, reject) => {
            const guard = setTimeout(() => resolve(new Response(bodyOnResolve)), 5_000)
            init.signal?.addEventListener(
                'abort',
                () => {
                    clearTimeout(guard)
                    reject(init.signal?.reason ?? new Error('aborted'))
                },
                { once: true }
            )
        })
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

test('fetchLatestWaWebVersion times out when fetch hangs', async () => {
    await assert.rejects(
        () =>
            fetchLatestWaWebVersion({
                fetch: hangingFetchStub('"client_revision":1'),
                timeoutMs: 25
            }),
        /timed out after 25ms/
    )
})

test('fetchLatestWaWebVersion honors external abort signal', async () => {
    const controller = new AbortController()
    const pending = fetchLatestWaWebVersion({
        fetch: hangingFetchStub('"client_revision":1'),
        signal: controller.signal
    })
    controller.abort(new Error('user-cancelled'))
    await assert.rejects(pending, /user-cancelled/)
})

const PAGE_WITH_VERSION =
    '<html><head><title>WhatsApp Messenger for Android</title></head>' +
    '<body><h2>2.26.27.70</h2><span>Jul 10, 2026</span>' +
    '<section class="older">2.26.15.11</section></body></html>'

test('fetchLatestWaMobileVersion parses the first version and returns versioned result', async () => {
    let seenUrl = ''
    let seenHeaders: Headers | undefined
    const fetchStub = makeFetchStub((url, init) => {
        seenUrl = url
        seenHeaders = new Headers(init.headers)
        return new Response(PAGE_WITH_VERSION, { status: 200 })
    })

    const result = await fetchLatestWaMobileVersion({ fetch: fetchStub })

    assert.equal(seenUrl, 'https://whatsapp-messenger.en.uptodown.com/android')
    assert.match(seenHeaders?.get('user-agent') ?? '', /Mozilla/)
    assert.equal(result.version, '2.26.27.70')
    assert.deepEqual(result.parts, [2, 26, 27, 70])
})

test('fetchLatestWaMobileVersion accepts a three-part version', async () => {
    const fetchStub = makeFetchStub(() => new Response('<h2>2.26.15</h2>', { status: 200 }))
    const result = await fetchLatestWaMobileVersion({ fetch: fetchStub })
    assert.equal(result.version, '2.26.15')
    assert.deepEqual(result.parts, [2, 26, 15])
})

test('fetchLatestWaMobileVersion honors url and versionPattern overrides', async () => {
    let seenUrl = ''
    const fetchStub = makeFetchStub((url) => {
        seenUrl = url
        return new Response('current: v2.30.1.4 (build)', { status: 200 })
    })

    const result = await fetchLatestWaMobileVersion({
        fetch: fetchStub,
        url: 'https://mirror.example/whatsapp',
        versionPattern: /v(2(?:\.\d+){3})/
    })

    assert.equal(seenUrl, 'https://mirror.example/whatsapp')
    assert.equal(result.version, '2.30.1.4')
})

test('fetchLatestWaMobileVersion forwards user-agent override and extra headers', async () => {
    let seenHeaders: Headers | undefined
    const fetchStub = makeFetchStub((_url, init) => {
        seenHeaders = new Headers(init.headers)
        return new Response('<h2>2.26.27.70</h2>', { status: 200 })
    })

    await fetchLatestWaMobileVersion({
        fetch: fetchStub,
        userAgent: 'custom-ua/1.0',
        headers: { 'X-Trace': 'abc' }
    })

    assert.equal(seenHeaders?.get('user-agent'), 'custom-ua/1.0')
    assert.equal(seenHeaders?.get('x-trace'), 'abc')
})

test('fetchLatestWaMobileVersion forwards dispatcher when proxy is a dispatcher', async () => {
    let seenDispatcher: unknown
    const fetchStub = makeFetchStub((_url, init) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response('<h2>2.26.27.70</h2>', { status: 200 })
    })
    const dispatcher = { dispatch: () => undefined }

    await fetchLatestWaMobileVersion({ fetch: fetchStub, proxy: dispatcher })
    assert.equal(seenDispatcher, dispatcher)
})

test('fetchLatestWaMobileVersion ignores agent-shaped proxy (fetch only takes dispatcher)', async () => {
    let seenDispatcher: unknown = 'unset'
    const fetchStub = makeFetchStub((_url, init) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response('<h2>2.26.27.70</h2>', { status: 200 })
    })
    const agent = { addRequest: () => undefined } as unknown as WaProxyTransport

    await fetchLatestWaMobileVersion({ fetch: fetchStub, proxy: agent })
    assert.equal(seenDispatcher, undefined)
})

test('fetchLatestWaMobileVersion throws on non-2xx response', async () => {
    const fetchStub = makeFetchStub(() => new Response('nope', { status: 503 }))
    await assert.rejects(() => fetchLatestWaMobileVersion({ fetch: fetchStub }), /http 503/)
})

test('fetchLatestWaMobileVersion throws when no version is present', async () => {
    const fetchStub = makeFetchStub(() => new Response('no version here', { status: 200 }))
    await assert.rejects(
        () => fetchLatestWaMobileVersion({ fetch: fetchStub }),
        /wa-mobile version not found/
    )
})

test('fetchLatestWaMobileVersion wraps network failures', async () => {
    const fetchStub = makeFetchStub(() => {
        throw new Error('boom')
    })
    await assert.rejects(
        () => fetchLatestWaMobileVersion({ fetch: fetchStub }),
        /failed to fetch wa-mobile version page: boom/
    )
})

test('fetchLatestWaMobileVersion times out when fetch hangs', async () => {
    await assert.rejects(
        () =>
            fetchLatestWaMobileVersion({
                fetch: hangingFetchStub('<h2>2.26.27.70</h2>'),
                timeoutMs: 25
            }),
        /timed out after 25ms/
    )
})

test('fetchLatestWaMobileVersion honors external abort signal', async () => {
    const controller = new AbortController()
    const pending = fetchLatestWaMobileVersion({
        fetch: hangingFetchStub('<h2>2.26.27.70</h2>'),
        signal: controller.signal
    })
    controller.abort(new Error('user-cancelled'))
    await assert.rejects(pending, /user-cancelled/)
})
