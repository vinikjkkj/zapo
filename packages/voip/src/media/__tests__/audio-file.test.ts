import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { decodeAudioFile } from '../audio-file.js'

test('decodeAudioFile rejects a missing file before probing ffmpeg', async () => {
    const missing = join(tmpdir(), 'zapo-voip-no-such-audio-file.wav')
    await assert.rejects(decodeAudioFile(missing, 16_000), {
        message: `File not found: ${missing}`
    })
})
