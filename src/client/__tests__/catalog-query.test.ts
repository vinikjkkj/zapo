import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import test from 'node:test'

import { queryCatalogGraphql } from '@client/catalog-query'
import { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { WA_CATALOG } from '@protocol/catalog'
import { TEXT_ENCODER } from '@util/bytes'

function transfer(body: string | Uint8Array, status = 200) {
    class Transfer extends WaMediaTransferClient {
        public override async uploadStream() {
            return {
                url: WA_CATALOG.PUBLIC_ENDPOINT,
                ok: status === 200,
                status,
                headers: {},
                body: Readable.from([typeof body === 'string' ? TEXT_ENCODER.encode(body) : body])
            }
        }
    }
    return new Transfer()
}

const query = {
    owner: false,
    token: 'test-token',
    docId: '1',
    variables: {},
    locale: 'en_US',
    signal: new AbortController().signal
}

test('catalog HTTP rejects malformed JSON and missing data', async () => {
    for (const body of ['not json', '[]', '{}']) {
        await assert.rejects(queryCatalogGraphql(transfer(body), query), {
            code: 'CATALOG_INVALID_RESPONSE'
        })
    }
})

test('catalog HTTP preserves error codes without exposing remote messages', async () => {
    for (const body of [
        { error: { code: 190, message: 'private-token' } },
        { errors: [{ code: 190, message: 'private-token' }] }
    ]) {
        await assert.rejects(queryCatalogGraphql(transfer(JSON.stringify(body)), query), {
            code: 'CATALOG_QUERY_FAILED',
            remoteCode: 190,
            message: 'catalog query failed'
        })
    }
    for (const body of ['{}', 'not json', '[]', '']) {
        await assert.rejects(queryCatalogGraphql(transfer(body, 503), query), {
            code: 'CATALOG_QUERY_FAILED',
            remoteCode: 503
        })
    }
    await assert.rejects(
        queryCatalogGraphql(transfer('{"errors":[{"message":"private-token"}]}'), query),
        { code: 'CATALOG_QUERY_FAILED', remoteCode: null, message: 'catalog query failed' }
    )
})

test('catalog HTTP bounds response bytes', async () => {
    await assert.rejects(
        queryCatalogGraphql(transfer(new Uint8Array(WA_CATALOG.MAX_RESPONSE_BYTES + 1)), query)
    )
})

for (const mode of ['timeout', 'disconnect'] as const) {
    test(`catalog HTTP ${mode} terminates an unfinished body after headers`, async (t) => {
        const server = createServer((_request, response) => {
            response.writeHead(200, { 'Content-Type': 'application/json' })
            response.flushHeaders()
            response.write('{"data":')
        })
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        t.after(async () => {
            server.closeAllConnections()
            await new Promise<void>((resolve) => server.close(() => resolve()))
        })
        const address = server.address()
        assert.ok(address && typeof address !== 'string')
        const url = `http://127.0.0.1:${address.port}`
        let notifyReading!: () => void
        const reading = new Promise<void>((resolve) => {
            notifyReading = resolve
        })
        let responseBody: Readable | null | undefined
        class Transfer extends WaMediaTransferClient {
            public override uploadStream(
                input: Parameters<WaMediaTransferClient['uploadStream']>[0]
            ) {
                return super.uploadStream({ ...input, url })
            }
            public override readResponseBytes(
                response: Parameters<WaMediaTransferClient['readResponseBytes']>[0],
                maxBytes?: number
            ) {
                responseBody = response.body
                const result = super.readResponseBytes(response, maxBytes)
                notifyReading()
                return result
            }
        }
        t.mock.timers.enable({ apis: ['setTimeout'] })
        const controller = new AbortController()
        const pending = queryCatalogGraphql(new Transfer(), { ...query, signal: controller.signal })
        const rejected = assert.rejects(pending, {
            code: mode === 'timeout' ? 'CATALOG_QUERY_TIMEOUT' : 'CATALOG_DISCONNECTED'
        })
        await reading
        if (mode === 'timeout') t.mock.timers.tick(WA_CATALOG.QUERY_TIMEOUT_MS)
        else controller.abort(new Error('private disconnect details'))
        await rejected
        assert.equal(responseBody?.destroyed, true)
    })
}

test('catalog HTTP normalizes transport and body failures without leaking details', async () => {
    class FailedUpload extends WaMediaTransferClient {
        public override async uploadStream(): Promise<never> {
            throw new Error('private transport details')
        }
    }
    class FailedBody extends WaMediaTransferClient {
        public override async uploadStream() {
            return {
                url: WA_CATALOG.PUBLIC_ENDPOINT,
                ok: true,
                status: 200,
                headers: {},
                body: Readable.from(
                    (async function* () {
                        yield TEXT_ENCODER.encode('{"data":')
                        throw new Error('private body details')
                    })()
                )
            }
        }
    }
    for (const instance of [new FailedUpload(), new FailedBody()]) {
        await assert.rejects(queryCatalogGraphql(instance, query), {
            name: 'WaCatalogError',
            code: 'CATALOG_QUERY_FAILED',
            message: 'catalog transport failed'
        })
    }
})

test('catalog HTTP does not send an already cancelled query', async () => {
    const controller = new AbortController()
    controller.abort()
    let uploadCalls = 0
    class Transfer extends WaMediaTransferClient {
        public override async uploadStream(): Promise<never> {
            uploadCalls += 1
            throw new Error('unexpected upload')
        }
    }
    await assert.rejects(
        queryCatalogGraphql(new Transfer(), { ...query, signal: controller.signal }),
        {
            code: 'CATALOG_DISCONNECTED'
        }
    )
    assert.equal(uploadCalls, 0)
})
