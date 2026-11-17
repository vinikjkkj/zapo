import assert from 'node:assert/strict'
import test from 'node:test'

import { WaAbPropsCoordinator } from '@client/coordinators/WaAbPropsCoordinator'
import { createNoopLogger } from '@infra/log/types'
import type { BinaryNode } from '@transport/types'

interface ServedProp {
    readonly configCode: number
    readonly configValue?: string
}

function buildAbPropsResult(props: readonly ServedProp[]): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: 'props',
                attrs: {
                    protocol: '1',
                    hash: 'test-hash',
                    refresh: '86400',
                    refresh_id: '1',
                    delta_update: 'false'
                },
                content: props.map((prop) => ({
                    tag: 'prop',
                    attrs: {
                        config_code: String(prop.configCode),
                        ...(prop.configValue !== undefined
                            ? { config_value: prop.configValue }
                            : {})
                    }
                }))
            }
        ]
    }
}

async function syncWith(props: readonly ServedProp[]): Promise<WaAbPropsCoordinator> {
    const coordinator = new WaAbPropsCoordinator({
        logger: createNoopLogger(),
        runtime: {
            queryWithContext: async () => buildAbPropsResult(props)
        }
    })
    coordinator.sync()
    // Let the sync promise chain settle before reading the cache back.
    for (let i = 0; i < 8; i += 1) {
        await Promise.resolve()
    }
    return coordinator
}

test('ab props decode each wire type the way WA Web does', async () => {
    const coordinator = await syncWith([
        { configCode: 1304, configValue: '1024' }, // group_size_limit, int
        { configCode: 26731, configValue: '0.3' }, // fuzzy search threshold, float
        { configCode: 3810, configValue: '20601229' }, // newsletter tos id, string
        { configCode: 6939, configValue: '1' } // adv_accept_hosted_devices, bool
    ])

    assert.equal(coordinator.getConfigValue('group_size_limit'), 1024)
    assert.equal(
        coordinator.getConfigValue('wa_web_contact_and_chat_fuzzy_search_distance_threshold'),
        0.3
    )
    assert.equal(coordinator.getConfigValue('newsletter_tos_notice_id'), '20601229')
    assert.equal(coordinator.getConfigValue('adv_accept_hosted_devices'), true)
})

test('ab props keep served negative ints instead of falling back to the default', async () => {
    const coordinator = await syncWith([
        { configCode: 25682, configValue: '-1' }, // discard dialog threshold, default -1
        { configCode: 29063, configValue: '-5' } // frequently contacted, default -1
    ])

    assert.equal(coordinator.getConfigValue('wa_web_group_discard_dialog_contact_threshold'), -1)
    assert.equal(coordinator.getConfigValue('web_frequently_contacted_enabled'), -5)
})

test('ab props fall back to the default for unparsable numbers and unknown codes', async () => {
    const coordinator = await syncWith([
        { configCode: 1304, configValue: 'not-a-number' },
        { configCode: 26731, configValue: '' },
        { configCode: 999_999, configValue: '7' }
    ])

    assert.equal(coordinator.getConfigValue('group_size_limit'), 257)
    assert.equal(
        coordinator.getConfigValue('wa_web_contact_and_chat_fuzzy_search_distance_threshold'),
        0.30000001192092896
    )
})

test('ab props reset drops every cached override', async () => {
    const coordinator = await syncWith([{ configCode: 1304, configValue: '1024' }])
    assert.equal(coordinator.getConfigValue('group_size_limit'), 1024)

    coordinator.reset()

    assert.equal(coordinator.getConfigValue('group_size_limit'), 257)
})

test('ab props served for the post-quantum flags are read by name', async () => {
    const coordinator = await syncWith([
        { configCode: 21198, configValue: '1' },
        { configCode: 24160, configValue: '1' },
        { configCode: 21201, configValue: '4' },
        { configCode: 21200, configValue: '50' }
    ])

    assert.equal(coordinator.getConfigValue<boolean>('pq_keys_upload'), true)
    assert.equal(coordinator.getConfigValue<boolean>('pq_1on1_message_enabled'), true)
    assert.equal(coordinator.getConfigValue<number>('pq_batch_upload_size'), 4)
    assert.equal(coordinator.getConfigValue<number>('pq_max_keys_on_server'), 50)
    assert.equal(
        new WaAbPropsCoordinator({
            logger: createNoopLogger(),
            runtime: { queryWithContext: async () => buildAbPropsResult([]) }
        }).getConfigValue<boolean>('pq_keys_upload'),
        false
    )
})

test('waitForSync settles once the sync in flight has applied its props', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const coordinator = new WaAbPropsCoordinator({
        logger: createNoopLogger(),
        runtime: {
            queryWithContext: async () => {
                await gate
                return buildAbPropsResult([{ configCode: 21198, configValue: '1' }])
            }
        }
    })

    await coordinator.waitForSync()
    coordinator.sync()
    let settled = false
    const waiting = coordinator.waitForSync().then(() => {
        settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)

    release()
    await waiting
    assert.equal(coordinator.getConfigValue<boolean>('pq_keys_upload'), true)
})
