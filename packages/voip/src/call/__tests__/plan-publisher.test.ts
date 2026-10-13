import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { WaCallPlanPublisher } from '../WaCallPlanPublisher.js'

import { RecordingMediaLink } from './_helpers.js'

const CALL = { callId: '006AFEADB13F4EDFE9D8BA599B10EA96' }

function createPublisher(): { publisher: WaCallPlanPublisher; link: RecordingMediaLink } {
    const link = new RecordingMediaLink()
    return { publisher: new WaCallPlanPublisher(link, createNoopLogger(), CALL), link }
}

test('an update keeps only the sections that changed, and an empty one is not sent', async () => {
    const { publisher, link } = createPublisher()

    await publisher.publish({ mediaType: 'audio', muted: false })
    await publisher.publish({ mediaType: 'audio', muted: true })
    await publisher.publish({ mediaType: 'audio', muted: true })

    assert.deepEqual(link.updates, [{ mediaType: 'audio', muted: false }, { muted: true }])
})

/** A relay list handed over again is how a media side with no leg left is asked to dial. */
test('relays are handed over again even when they did not change', async () => {
    const { publisher, link } = createPublisher()
    const relays = { endpoints: [], selfPid: 1, peerPid: 2 }

    await publisher.publish({ relays })
    await publisher.publish({ relays: { ...relays } })

    assert.equal(link.sections('relays').length, 2)
})
