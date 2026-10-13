import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { resolveOfferParticipantDevices, resolvePeerLid } from '../peer-devices.js'
import type { WaVoipDeps } from '../types.js'

const logger = createNoopLogger()

test('resolvePeerLid keeps a lid, maps a phone jid, and falls back to it on failure', async () => {
    const deps = {
        signalDeviceSync: {
            queryLidsByPhoneJids: async () => [{ lidJid: '111@lid' }]
        }
    } as unknown as WaVoipDeps
    assert.equal(await resolvePeerLid(deps, '222@lid', logger), '222@lid')
    assert.equal(await resolvePeerLid(deps, '5511@s.whatsapp.net', logger), '111@lid')

    const offline = {
        signalDeviceSync: { queryLidsByPhoneJids: () => Promise.reject(new Error('offline')) }
    } as unknown as WaVoipDeps
    assert.equal(
        await resolvePeerLid(offline, '5511@s.whatsapp.net', logger),
        '5511@s.whatsapp.net'
    )
})

test('resolveOfferParticipantDevices syncs only the participants given no devices', async () => {
    const queried: string[][] = []
    const deps = {
        signalDeviceSync: {
            syncDeviceList: async (jids: string[]) => {
                queried.push(jids)
                return [{ jid: '2@lid', deviceJids: ['2:0@lid', '2:5@lid'] }]
            }
        }
    } as unknown as WaVoipDeps

    const resolved = await resolveOfferParticipantDevices(
        deps,
        [{ jid: '1@lid', devices: ['1:3@lid'] }, { jid: '2@lid' }, { jid: '3@lid' }],
        logger
    )

    assert.deepEqual(queried, [['2@lid', '3@lid']])
    assert.deepEqual(resolved, [
        { jid: '1@lid', devices: ['1:3@lid'] },
        { jid: '2@lid', devices: ['2:0@lid', '2:5@lid'] },
        { jid: '3@lid', devices: [] }
    ])
})
