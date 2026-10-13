import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallMediaGroup, WaCallMediaRelays } from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../../crypto/ssrc.js'
import { WaVoipSettings } from '../../signaling/voip-settings.js'
import {
    CallMediaType,
    CallState,
    EndCallReason,
    type RelayData,
    type WaVoipDeps
} from '../../types.js'
import { CallInfo } from '../call-state.js'
import { selfStreamLayers, senderStreamsOf } from '../group-media-plan.js'
import {
    createGroupComposition,
    WA_CALL_PARTICIPANT_STATE,
    type WaGroupCompositionDiff,
    type WaGroupParticipant
} from '../group-participants.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate, type RecordingMediaLink, recordMediaLink } from './_helpers.js'

const ID = 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'
const GROUP_JID = '120363431977320048@g.us'
const SELF = '184478207058035@lid'
const SELF_DEVICE = '184478207058035:1@lid'
const PEER = '50062877036657@lid'
const PEER_DEVICE = '50062877036657:76@lid'
const PEER_SECOND_DEVICE = '50062877036657:12@lid'
const THIRD = '112984198234339@lid'
const THIRD_DEVICE = '112984198234339:0@lid'
const FOURTH = '777777777777@lid'
const FOURTH_DEVICE = '777777777777:0@lid'

const CONNECTED = WA_CALL_PARTICIPANT_STATE.Connected
const CALL_KEY = new Uint8Array(32).fill(0x5a)
const OTHER_CALL_KEY = new Uint8Array(32).fill(0x33)

const THREE_WAY: readonly WaGroupParticipant[] = [
    { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
    { jid: PEER, devices: [PEER_DEVICE, PEER_SECOND_DEVICE], state: CONNECTED },
    { jid: THIRD, devices: [THIRD_DEVICE], state: CONNECTED }
]

interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly link: RecordingMediaLink
    readonly sent: BinaryNode[]
    readonly diffs: WaGroupCompositionDiff[]
    readonly ended: EndCallReason[]
    /** Every state the call was reported in, in order. */
    readonly states: CallState[]
    /** Who each video upgrade of the call was reported at. */
    readonly upgrades: (string | null)[]
    /** Every per-participant event, as `[event, participantJid, value]`. */
    readonly events: [string, string | undefined, unknown][]
    /** Debug log lines, message and context. */
    readonly logs: [string, Record<string, unknown> | undefined][]
    /** The session clock, advanced by the test. */
    readonly clock: { now: number }
    /** Devices whose Signal session is missing, so a key cannot be encrypted for them. */
    readonly unreachable: Set<string>
}

async function createSession(
    options: {
        readonly composition?: readonly WaGroupParticipant[] | null
        readonly direction?: 'incoming' | 'outgoing'
        readonly mediaType?: CallMediaType
        readonly relayData?: RelayData
        readonly group?: boolean
        /** A call built by the test, used as it is. */
        readonly info?: CallInfo
    } = {}
): Promise<Harness> {
    const events: [string, string | undefined, unknown][] = []
    const logs: [string, Record<string, unknown> | undefined][] = []
    const clock = { now: 1_000 }
    const logger = {
        ...createNoopLogger(),
        debug: (message: string, context?: Record<string, unknown>) => {
            logs.push([message, context])
        }
    }
    const sent: BinaryNode[] = []
    const diffs: WaGroupCompositionDiff[] = []
    const ended: EndCallReason[] = []
    const states: CallState[] = []
    const upgrades: (string | null)[] = []
    const unreachable = new Set<string>()
    const mediaType = options.mediaType ?? CallMediaType.Audio
    const call =
        options.info ??
        (options.direction === 'outgoing'
            ? CallInfo.newOutgoing(ID, PEER, SELF_DEVICE, mediaType)
            : CallInfo.newIncoming(ID, PEER_DEVICE, PEER_DEVICE, undefined, mediaType))
    if (!options.info && options.group !== false) {
        call.groupJid = GROUP_JID
        call.joinable = true
        if (options.composition !== null) {
            call.groupComposition = createGroupComposition(options.composition ?? THREE_WAY)
        }
    }
    if (!options.info) call.relayData = options.relayData

    const { link, createMediaLink } = recordMediaLink()
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE, meLid: SELF_DEVICE })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        sessionResolver: {
            ensureSessionsBatch: async (devices: readonly string[]) => {
                for (const jid of devices) {
                    if (unreachable.has(jid)) throw new Error(`no session for ${jid}`)
                }
                return devices.map((jid) => ({ address: jid, session: {} }))
            }
        },
        signalProtocol: {
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: Uint8Array.of(1, 2, 3) }))
        }
    } as unknown as WaVoipDeps

    const session = new WaCallMediaSession({
        deps,
        logger,
        info: call,
        createMediaLink,
        now: () => clock.now,
        delegate: createSessionDelegate({
            emitPeerMute: (_call, muted, jid) => {
                events.push(['mute', jid, muted])
            },
            emitMuteRequested: (_call, jid, requestState) => {
                events.push(['mute_requested', jid, requestState])
            },
            emitHandRaise: (_call, jid, raised) => {
                events.push(['hand', jid, raised])
            },
            emitPeerVideoState: (_call, change, jid) => {
                events.push(['video', jid, change.state])
            },
            emitScreenShare: (_call, share, jid) => {
                events.push(['screen_share', jid, share.state])
            },
            emitCallReaction: (_call, reaction, jid) => {
                events.push(['reaction', jid, reaction.reaction])
            },
            emitInboundVideoRtp: (_call, packet, jid) => {
                events.push(['video_rtp', jid, packet.ssrc])
            },
            emitParticipantMedia: (_call, jid, receiving) => {
                events.push(['participant_media', jid, receiving])
            },
            emitState: (reported) => {
                states.push(reported.stateData.state)
            },
            emitVideoUpgraded: (_call, upgraderJid) => {
                upgrades.push(upgraderJid)
            },
            emitParticipantsChanged: (_call, diff) => {
                diffs.push(diff)
            },
            endCall: (_call, reason) => {
                ended.push(reason)
            }
        })
    })
    await session.initMedia(SELF_DEVICE, options.direction === 'outgoing' ? PEER : PEER_DEVICE)
    return {
        session,
        call,
        link,
        sent,
        diffs,
        ended,
        states,
        upgrades,
        events,
        logs,
        clock,
        unreachable
    }
}

function innerOf(node: BinaryNode): BinaryNode {
    return (node.content as BinaryNode[])[0]
}

function sentWithTag(harness: Harness, tag: string): BinaryNode[] {
    return harness.sent.filter((node) => innerOf(node).tag === tag)
}

function lastGroup(link: RecordingMediaLink): WaCallMediaGroup | null | undefined {
    return link.sections('group').at(-1)
}

function senderStreams(deviceJids: readonly string[], coversVideo = false): number[] {
    return deviceJids.flatMap((jid) => senderStreamsOf(ID, jid, coversVideo))
}

interface RosterEntry {
    readonly jid: string
    readonly devices: readonly string[]
    readonly state?: string
    readonly tosNotAccepted?: boolean
    /** `<device pid>` per device jid. */
    readonly pids?: Readonly<Record<string, string>>
}

function toRoster(participants: readonly WaGroupParticipant[]): RosterEntry[] {
    return participants.map((participant) => ({
        jid: participant.jid,
        devices: participant.devices,
        state: participant.state ?? CONNECTED
    }))
}

/** A `<group_update>`: the roster is the whole call, `rekey` and the tid sit on `<group_info>`. */
function groupUpdate(options: {
    readonly transactionId?: number
    readonly rekey?: boolean
    readonly roster?: readonly RosterEntry[]
    readonly relay?: BinaryNode
}): BinaryNode {
    const content: BinaryNode[] = []
    if (options.roster) {
        const attrs: Record<string, string> = { media: 'audio', 'connected-limit': '32' }
        if (options.transactionId !== undefined) {
            attrs['transaction-id'] = String(options.transactionId)
        }
        if (options.rekey) attrs.rekey = '1'
        content.push({
            tag: 'group_info',
            attrs,
            content: options.roster.map((entry) => ({
                tag: 'user',
                attrs: {
                    jid: entry.jid,
                    ...(entry.state ? { state: entry.state } : {}),
                    ...(entry.tosNotAccepted ? { tos_not_accepted: '1' } : {})
                },
                content: entry.devices.map((jid) => ({
                    tag: 'device',
                    attrs: { jid, ...(entry.pids?.[jid] !== undefined && { pid: entry.pids[jid] }) }
                }))
            }))
        })
    }
    if (options.relay) content.push(options.relay)
    return {
        tag: 'call',
        attrs: { from: `${ID}@call`, id: 'GROUPUPDATE' },
        content: [
            {
                tag: 'group_update',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content
            }
        ]
    }
}

interface RelaySpec {
    readonly name: string
    readonly v4: readonly [number, number, number, number]
    readonly v6: number
    readonly token: Uint8Array
    readonly rtt?: number
}

const SIN: RelaySpec = { name: 'sin6c02', v4: [10, 1, 1, 1], v6: 1, token: Uint8Array.of(0x51) }
const GRU: RelaySpec = {
    name: 'gru2c01',
    v4: [10, 2, 2, 2],
    v6: 2,
    token: Uint8Array.of(0xa1),
    rtt: 19
}
const GIG: RelaySpec = {
    name: 'gig4c02',
    v4: [10, 3, 3, 3],
    v6: 3,
    token: Uint8Array.of(0xb1),
    rtt: 27
}
const LIS: RelaySpec = {
    name: 'lis1c01',
    v4: [10, 5, 5, 5],
    v6: 5,
    token: Uint8Array.of(0xd1),
    rtt: 44
}

function dualStack(relay: RelaySpec): Uint8Array {
    const v6 = new Uint8Array(18)
    v6[0] = 0xfd
    v6[15] = relay.v6
    v6[16] = 0x0d
    v6[17] = 0x96
    return Uint8Array.from([...relay.v4, 0x0d, 0x96, ...v6])
}

/** A `<relay>` listing each relay under `protocol=1` first, then dialable, over both families. */
function relayDescriptor(spec: {
    readonly selfPid: string
    readonly relays: readonly RelaySpec[]
    readonly hbhKey?: Uint8Array
    readonly dialable?: boolean
}): BinaryNode {
    const content: BinaryNode[] = [{ tag: 'key', attrs: {}, content: 'REISSUEDRELAYKEY' }]
    if (spec.hbhKey) content.push({ tag: 'hbh_key', attrs: {}, content: spec.hbhKey })
    spec.relays.forEach((relay, index) => {
        content.push({ tag: 'token', attrs: { id: String(index) }, content: relay.token })
    })
    spec.relays.forEach((relay, index) => {
        const attrs: Record<string, string> = {
            relay_name: relay.name,
            relay_id: String(index),
            token_id: String(index),
            ...(relay.rtt !== undefined ? { c2r_rtt: String(relay.rtt) } : {})
        }
        content.push({ tag: 'te2', attrs: { ...attrs, protocol: '1' }, content: dualStack(relay) })
        if (spec.dialable !== false) {
            content.push({ tag: 'te2', attrs, content: dualStack(relay) })
        }
    })
    return { tag: 'relay', attrs: { self_pid: spec.selfPid, peer_pid: '0' }, content }
}

const OFFER_HBH_KEY = Uint8Array.from({ length: 30 }, (_, i) => i + 1)

function offerRelayData(): RelayData {
    return {
        endpoints: [
            {
                ip: '10.1.1.1',
                port: 3478,
                token: 'T',
                rawToken: SIN.token,
                key: 'OFFERKEY',
                relayId: 0,
                relayName: SIN.name
            }
        ],
        participantJids: [PEER_DEVICE],
        uuid: 'OFFERUUID',
        selfPid: 0,
        hbhKey: OFFER_HBH_KEY
    }
}

function relaysPublished(link: RecordingMediaLink): (WaCallMediaRelays | null | undefined)[] {
    return link.sections('relays')
}

test('a group call declares its streams by layer and recognizes app data from every sender', async () => {
    const harness = await createSession()

    const ssrcs = harness.link.plan.ssrcs
    assert.ok(ssrcs)
    assert.deepEqual(ssrcs.selfLayers, selfStreamLayers(ID, SELF_DEVICE))
    for (const device of [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]) {
        const appData = generateSecureSsrc(ID, device, WA_SSRC_SLOT.APP_DATA.MAIN)
        assert.ok(ssrcs.peerAppData.includes(appData), device)
    }
    assert.deepEqual(
        ssrcs.peerStreams,
        senderStreams([PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE])
    )
    assert.equal(
        ssrcs.peerAppData.includes(generateSecureSsrc(ID, SELF_DEVICE, WA_SSRC_SLOT.APP_DATA.MAIN)),
        false
    )
    // No key yet, so nobody can be keyed.
    assert.equal(harness.link.sections('group').length, 0)
})

test('a 1:1 call declares no layers and publishes no group', async () => {
    const harness = await createSession({ group: false })
    await harness.session.applyCallKey(CALL_KEY, 1)

    assert.equal(harness.link.plan.ssrcs?.selfLayers, undefined)
    assert.equal(harness.link.sections('group').length, 0)
    assert.equal(harness.link.sections('keys').length, 0, 'a rekey on a 1:1 call is ignored')
    assert.equal(harness.call.encryptionKey, undefined)
})

test('a call key keys every sender with its own device key', async () => {
    const harness = await createSession()

    await harness.session.applyCallKey(CALL_KEY, 13)

    const keys = harness.link.plan.keys
    assert.ok(keys)
    assert.deepEqual(keys.send, derivePerJidSrtpKey(CALL_KEY, SELF_DEVICE))
    const group = lastGroup(harness.link)
    assert.ok(group)
    assert.deepEqual(
        group.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )
    assert.deepEqual(
        group.senders.map((sender) => sender.audio),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            generateSecureSsrc(ID, jid, WA_SSRC_SLOT.AUDIO.MAIN)
        )
    )
    // Keys and senders travel in one update, so the media rebuilds and reinstalls together.
    const update = harness.link.updates.at(-1)
    assert.ok(update && 'keys' in update && 'group' in update)
})

test('the same key again changes nothing, a new one replaces every key', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const published = harness.link.updates.length
    const firstEpoch = harness.link.plan.keys?.epoch

    await harness.session.applyCallKey(Uint8Array.from(CALL_KEY), 2)
    assert.equal(harness.link.updates.length, published)

    await harness.session.applyCallKey(OTHER_CALL_KEY, 3)
    assert.notEqual(harness.link.plan.keys?.epoch, firstEpoch)
    assert.deepEqual(
        lastGroup(harness.link)?.senders[0].recv,
        derivePerJidSrtpKey(OTHER_CALL_KEY, PEER_DEVICE)
    )
})

test('a participant joining is keyed and announced, the same roster again changes nothing', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    const fourWay = [...THREE_WAY, { jid: FOURTH, devices: [FOURTH_DEVICE], state: CONNECTED }]
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 5, roster: toRoster(fourWay) })
    )

    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE, FOURTH_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )
    assert.equal(harness.diffs.length, 1)
    assert.equal(harness.diffs[0].added[0]?.jid, FOURTH)
    assert.equal(harness.call.groupComposition?.lastTransactionId, 5)

    const groups = harness.link.sections('group').length
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 6, roster: toRoster(fourWay) })
    )
    assert.equal(harness.link.sections('group').length, groups, 'nothing moved')
})

test('a participant left out of the roster stops being a sender', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 4, roster: toRoster(THREE_WAY.slice(0, 2)) })
    )

    assert.equal(
        lastGroup(harness.link)?.senders.some(
            (sender) => sender.audio === generateSecureSsrc(ID, THIRD_DEVICE)
        ),
        false
    )
    assert.equal(harness.diffs[0].removed[0]?.jid, THIRD)
})

test('a participant hanging up comes off the composition without moving its counter', async () => {
    const harness = await createSession()
    harness.call.groupComposition = createGroupComposition(THREE_WAY, 9)
    await harness.session.applyCallKey(CALL_KEY, 1)

    harness.session.removeGroupParticipant(THIRD_DEVICE, undefined)
    await Promise.resolve()

    assert.deepEqual(
        harness.call.groupComposition?.participants.map((participant) => participant.jid),
        [SELF, PEER]
    )
    assert.equal(harness.call.groupComposition?.lastTransactionId, 9)
    assert.equal(harness.diffs.length, 1)
    assert.equal(harness.diffs[0].removed[0]?.cause, 'departed')
    assert.equal(lastGroup(harness.link)?.senders.length, 2)

    harness.session.removeGroupParticipant('424242@lid', 'terminated')
    assert.equal(harness.diffs.length, 1, 'somebody not on the call leaves nothing to report')
})

test('a group call that starts receiving video keys every sender on video too', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    harness.session.handleCallVideoState({
        tag: 'call',
        attrs: { from: PEER_DEVICE },
        content: [{ tag: 'video', attrs: { 'call-id': ID, state: '1', 'transaction-id': '1' } }]
    })
    await Promise.resolve()

    const group = lastGroup(harness.link)
    assert.deepEqual(
        group?.senders.map((sender) => sender.streams),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) => senderStreamsOf(ID, jid, true))
    )
})

test('a rekey asked of us mints a key and sends it once per device of each connected peer', async () => {
    const harness = await createSession()

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 13, rekey: true, roster: toRoster(THREE_WAY) })
    )

    const rekeys = sentWithTag(harness, 'enc_rekey')
    assert.deepEqual(
        rekeys.map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]
    )
    for (const node of rekeys) {
        const inner = innerOf(node)
        assert.equal(inner.attrs['transaction-id'], '13')
        assert.deepEqual(
            (inner.content as BinaryNode[]).map((child) => child.tag),
            ['encopt', 'enc']
        )
    }
    assert.ok(harness.call.encryptionKey, 'the key is ours, installed')
    assert.ok(harness.link.plan.keys)
})

test('the fan-out skips who has not accepted the terms and survives an unreachable device', async () => {
    const harness = await createSession()
    harness.unreachable.add(PEER_SECOND_DEVICE)
    const roster = toRoster(THREE_WAY).map((entry) =>
        entry.jid === THIRD ? { ...entry, tosNotAccepted: true } : entry
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 2, rekey: true, roster })
    )

    assert.deepEqual(
        sentWithTag(harness, 'enc_rekey').map((node) => node.attrs.to),
        [PEER_DEVICE]
    )
})

test('no rekey goes out unless asked, with us and somebody else connected', async () => {
    const plain = await createSession()
    await plain.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 2, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(plain, 'enc_rekey').length, 0)

    const notConnected = await createSession()
    await notConnected.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 2,
            rekey: true,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === SELF ? { ...entry, state: 'invited' } : entry
            )
        })
    )
    assert.equal(sentWithTag(notConnected, 'enc_rekey').length, 0)
    assert.equal(notConnected.call.encryptionKey, undefined)

    const alone = await createSession()
    await alone.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 2,
            rekey: true,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === SELF ? entry : { ...entry, state: 'invited' }
            )
        })
    )
    assert.equal(sentWithTag(alone, 'enc_rekey').length, 0)
})

test('a rekey on a stale roster still runs; one already answered does not run again', async () => {
    const harness = await createSession()
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 14, roster: toRoster(THREE_WAY) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 12, rekey: true, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(harness, 'enc_rekey').length, 3, 'the late update carried the rekey')
    assert.equal(harness.call.groupComposition?.lastTransactionId, 14, 'its roster was not taken')

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 12, rekey: true, roster: toRoster(THREE_WAY) })
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 11, rekey: true, roster: toRoster(THREE_WAY) })
    )
    assert.equal(sentWithTag(harness, 'enc_rekey').length, 3)
})

test('a reissued relay moves the call to a new generation of raw udp legs, elected first', async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GIG, GRU] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.ok(relays)
    assert.equal(relays.generation, 1)
    assert.equal(relays.selfPid, 1)
    // Every dialable relay, the elected one first, each over both families.
    assert.deepEqual(
        relays.endpoints.map((endpoint) => [endpoint.name, endpoint.ip, endpoint.transport]),
        [
            ['gru2c01', '10.2.2.2', 'raw-udp'],
            ['gru2c01', 'fd00::2', 'raw-udp'],
            ['gig4c02', '10.3.3.3', 'raw-udp'],
            ['gig4c02', 'fd00::3', 'raw-udp']
        ]
    )
    assert.deepEqual(relays.endpoints[0].rawToken, GRU.token)
    assert.deepEqual(relays.endpoints[2].rawToken, GIG.token)
    assert.equal(relays.endpoints[0].key, 'REISSUEDRELAYKEY')
    // The hop key and the participant list are kept when the reissue omits them.
    assert.deepEqual(harness.call.relayData?.hbhKey, OFFER_HBH_KEY)
    assert.deepEqual(harness.call.relayData?.participantJids, [PEER_DEVICE])
    // The relay is a separate matter from the roster.
    assert.equal(harness.diffs.length, 0)
})

test('an identical reissue dials nothing new, a changed runner-up is a new generation', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )
    const published = relaysPublished(harness.link).length

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 3, roster: toRoster(THREE_WAY) })
    )
    assert.equal(relaysPublished(harness.link).length, published)

    // The runner-up is a leg too, so replacing it moves the transport.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, LIS] }) })
    )
    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        [...new Set(relays?.endpoints.map((endpoint) => endpoint.name))],
        ['gru2c01', 'lis1c01']
    )
})

test('a relay re-credited at the same address is redialled with the new token', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )

    const reminted = Uint8Array.of(0xa9)
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, token: reminted }, GIG] })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.ip, endpoint.rawToken]),
        [
            ['10.2.2.2', reminted],
            ['fd00::2', reminted],
            ['10.3.3.3', GIG.token],
            ['fd00::3', GIG.token]
        ]
    )
})

test('a self_pid change alone republishes the relay under the new pid', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '2', relays: [GRU, GIG] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.equal(relays?.selfPid, 2)
    assert.equal(harness.call.relayData?.selfPid, 2)
})

test('the relay of a group update older than the newest one read is ignored', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const reminted = Uint8Array.of(0xa9)
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 14,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, token: reminted }, GIG] })
        })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.deepEqual(relays?.endpoints[0].rawToken, reminted)
})

test('a new round trip alone, the relays and credentials unchanged, dials nothing new', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [{ ...GRU, rtt: 99 }, GIG] })
        })
    )

    // Both relays already have legs; the relay layer follows whichever delivers.
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
})

test('a reissue moving to relays not held publishes them as the next generation', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GRU] }) })
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '1', relays: [GIG, LIS] }) })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        [...new Set(relays?.endpoints.map((endpoint) => endpoint.name))],
        ['gig4c02', 'lis1c01']
    )
})

test('a reissue with nothing dialable publishes no relays', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const published = relaysPublished(harness.link).length

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: relayDescriptor({ selfPid: '1', relays: [GRU, GIG], dialable: false })
        })
    )

    assert.equal(relaysPublished(harness.link).length, published)
})

test("a participant's transport carrying a new relay is followed on a group call", async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.handleCallTransport({
        tag: 'call',
        attrs: { from: PEER_DEVICE },
        content: [
            {
                tag: 'transport',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content: [relayDescriptor({ selfPid: '1', relays: [GIG] })]
            }
        ]
    })

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.endpoints[0].name, 'gig4c02')

    // A transport repeating the relay already followed changes nothing.
    await harness.session.handleCallTransport({
        tag: 'call',
        attrs: { from: THIRD_DEVICE },
        content: [
            {
                tag: 'transport',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content: [relayDescriptor({ selfPid: '1', relays: [GIG] })]
            }
        ]
    })
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
})

test('a group callee preaccepts and accepts to the call itself, with no key in hand', async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.sendIncomingPreaccept(PEER_DEVICE)
    await harness.session.acceptCall()

    const [preaccept] = sentWithTag(harness, 'preaccept')
    assert.equal(preaccept.attrs.to, `${ID}@call`)
    assert.deepEqual(
        (innerOf(preaccept).content as BinaryNode[]).map((child) => child.tag),
        ['audio', 'encopt', 'capability']
    )
    const [accept] = sentWithTag(harness, 'accept')
    assert.ok(accept, 'an accept went out with no key')
    assert.equal(accept.attrs.to, `${ID}@call`)
    assert.ok((innerOf(accept).content as BinaryNode[]).some((child) => child.tag === 'encopt'))
})

test('on a group call we placed, an accept connects once and sends nothing back', async () => {
    const harness = await createSession({ direction: 'outgoing' })
    harness.call.applyTransition({ type: 'offer_sent' })
    const accept = (from: string): BinaryNode => ({
        tag: 'call',
        attrs: { from, id: 'ACCEPT' },
        content: [{ tag: 'accept', attrs: { 'call-id': ID, 'call-creator': SELF_DEVICE } }]
    })

    await harness.session.handleCallAccept(accept(PEER_DEVICE), PEER_DEVICE)
    await harness.session.handleCallAccept(accept(THIRD_DEVICE), THIRD_DEVICE)

    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.plan.accepted, true)
    assert.deepEqual(
        harness.sent.map((node) => [innerOf(node).tag, node.attrs.to]),
        [['heartbeat', `${ID}@call`]],
        'no terminate elsewhere, transport or receipt: only the heartbeat of a joined call'
    )
    assert.equal(harness.link.sections('keys').length, 0)
})

test('the caller of a group call sends no preaccept on the offer ack', async () => {
    const harness = await createSession({ direction: 'outgoing' })

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': ID },
        content: [relayDescriptor({ selfPid: '0', relays: [SIN] })]
    })

    assert.equal(sentWithTag(harness, 'preaccept').length, 0)
})

test('leaving a group call sends one terminate to the call itself, with no reason', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.leaveCall()

    const terminates = sentWithTag(harness, 'terminate')
    assert.equal(terminates.length, 1)
    assert.equal(terminates[0].attrs.to, `${ID}@call`)
    const attrs = innerOf(terminates[0]).attrs
    assert.deepEqual(Object.keys(attrs), ['call-id', 'call-creator', 'duration', 'audio_duration'])
    assert.equal(attrs['call-id'], ID)
    assert.equal(attrs.duration, attrs.audio_duration)
    assert.equal(harness.call.isEnded, true)

    await harness.session.leaveCall()
    assert.equal(sentWithTag(harness, 'terminate').length, 1, 'nothing the second time')
})

test('ending a group call only takes us out: the same reason-less terminate as a leave', async () => {
    const harness = await createSession()

    await harness.session.endCall()

    const terminates = sentWithTag(harness, 'terminate')
    assert.deepEqual(
        terminates.map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [[`${ID}@call`, undefined]]
    )
    assert.equal(harness.call.isEnded, true)
})

test('a group call leaves through the call itself, whatever its composition', async () => {
    const harness = await createSession({ composition: null })

    await harness.session.leaveCall()

    assert.deepEqual(
        sentWithTag(harness, 'terminate').map((node) => node.attrs.to),
        [`${ID}@call`]
    )
})

test('a group offer the server refuses ends with setup_failed, told to the call itself', async () => {
    const harness = await createSession({ direction: 'outgoing' })
    harness.call.applyTransition({ type: 'offer_sent' })

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': ID, error: '400' }
    })

    assert.equal(harness.call.isEnded, true)
    assert.equal(harness.call.stateData.endReason, EndCallReason.SetupFailed)
    const terminates = sentWithTag(harness, 'terminate')
    assert.deepEqual(
        terminates.map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [[`${ID}@call`, 'setup_failed']]
    )
    assert.equal(harness.link.stopped, true)
})

test('a 1:1 call cannot be left, only ended, and its hangup carries no reason', async () => {
    const harness = await createSession({ group: false })

    await assert.rejects(() => harness.session.leaveCall(), /not a group call/)
    assert.equal(harness.call.isEnded, false)

    await harness.session.endCall()
    const [terminate] = sentWithTag(harness, 'terminate')
    assert.equal(terminate.attrs.to, PEER_DEVICE)
    assert.equal(innerOf(terminate).attrs.reason, undefined)
})

test('a video upgrade on a group call asks the call itself, and is granted by av_upgrade', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    const upgrading = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    const [request] = sentWithTag(harness, 'video')
    assert.equal(request.attrs.to, `${ID}@call`)
    assert.deepEqual(innerOf(request).attrs, {
        'call-id': ID,
        'call-creator': PEER_DEVICE,
        state: '3',
        device_orientation: '0',
        dec: 'H264',
        'transaction-id': '1',
        voip_settings: 'video'
    })

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(SELF_DEVICE))

    assert.equal(await upgrading, 'accepted')
    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.link.plan.video, { send: true, receive: true })
    assert.equal(sentWithTag(harness, 'video').length, 1, 'our camera is on: nothing more to say')
})

test('a group call that loses its relay asks its owner to take it down', async () => {
    const harness = await createSession()

    harness.link.events.onRelayLost('legs_closed')

    assert.deepEqual(harness.ended, [EndCallReason.RelayLost])
})

/** What the roster of a call we placed says right after the offer: only we are connected. */
const PLACED: readonly WaGroupParticipant[] = [
    { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
    { jid: PEER, devices: [PEER_DEVICE, PEER_SECOND_DEVICE], state: 'outgoing' },
    { jid: THIRD, devices: [THIRD_DEVICE], state: 'receipt' }
]

async function placedGroupCall(): Promise<Harness> {
    const harness = await createSession({
        direction: 'outgoing',
        composition: PLACED,
        relayData: offerRelayData()
    })
    harness.call.applyTransition({ type: 'offer_sent' })
    return harness
}

test('a group call we placed connects from the roster, with no accept', async () => {
    const harness = await placedGroupCall()

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 8, roster: toRoster(PLACED) })
    )
    assert.equal(harness.call.stateData.state, CallState.Ringing, 'only we are connected yet')
    assert.notEqual(harness.link.plan.accepted, true)

    const joined = PLACED.map((entry) =>
        entry.jid === PEER ? { ...entry, state: CONNECTED } : entry
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 13, roster: toRoster(joined) })
    )
    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.plan.accepted, true, 'the media starts')
    assert.equal(harness.states.filter((state) => state === CallState.Connecting).length, 1)

    // A second joiner moves nothing further, and an accept arriving late changes nothing.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 14,
            roster: toRoster(joined.map((entry) => ({ ...entry, state: CONNECTED })))
        })
    )
    await harness.session.handleCallAccept(
        {
            tag: 'call',
            attrs: { from: THIRD_DEVICE, id: 'ACCEPT' },
            content: [{ tag: 'accept', attrs: { 'call-id': ID, 'call-creator': SELF_DEVICE } }]
        },
        THIRD_DEVICE
    )
    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.sections('accepted').filter(Boolean).length, 1, 'joined once')
    assert.deepEqual(sentWithTag(harness, 'transport'), [])
})

test('the key a joiner sends while our call still rings keys it, and stays once it connects', async () => {
    const harness = await placedGroupCall()

    await harness.session.applyCallKey(CALL_KEY, 13)
    assert.equal(harness.call.stateData.state, CallState.Ringing)
    assert.deepEqual(harness.link.plan.keys?.send, derivePerJidSrtpKey(CALL_KEY, SELF_DEVICE))
    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster([
                PLACED[0],
                { jid: PEER, devices: [PEER_SECOND_DEVICE], state: CONNECTED },
                PLACED[2]
            ])
        })
    )

    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.deepEqual(harness.call.encryptionKey, CALL_KEY)
    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) => derivePerJidSrtpKey(CALL_KEY, jid))
    )
})

test('the relay in the roster that connects our call moves the media, before it starts', async () => {
    const harness = await placedGroupCall()
    const joined = PLACED.map((entry) =>
        entry.jid === PEER ? { ...entry, state: CONNECTED } : entry
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(joined),
            relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] })
        })
    )

    const relaysAt = harness.link.updates.findIndex((update) => update.relays?.generation === 1)
    const acceptedAt = harness.link.updates.findIndex((update) => update.accepted === true)
    assert.ok(relaysAt >= 0, 'the reissued relay is adopted')
    assert.ok(acceptedAt > relaysAt, 'and the media starts on it')
    assert.deepEqual(
        relaysPublished(harness.link)
            .at(-1)
            ?.endpoints.map((endpoint) => endpoint.transport),
        ['raw-udp', 'raw-udp', 'raw-udp', 'raw-udp']
    )
})

test('ending a group call that connected tells the call how long we were on it', async () => {
    const harness = await placedGroupCall()
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(
                PLACED.map((entry) => (entry.jid === PEER ? { ...entry, state: CONNECTED } : entry))
            )
        })
    )
    harness.link.events.onActive()
    assert.equal(harness.call.stateData.state, CallState.Active)

    await harness.session.endCall()

    const [terminate] = sentWithTag(harness, 'terminate')
    assert.equal(terminate.attrs.to, `${ID}@call`)
    const attrs = innerOf(terminate).attrs
    assert.deepEqual(Object.keys(attrs), ['call-id', 'call-creator', 'duration', 'audio_duration'])
    assert.equal(attrs.duration, attrs.audio_duration)
})

interface TokenedRelay {
    readonly relay: RelaySpec
    readonly tokenId: string
    readonly authTokenId?: string
}

/** A reissued `<relay>` whose `<te2>`s name their token and auth token by id, as the wire does. */
function tokenedDescriptor(spec: {
    readonly selfPid: string
    readonly tokens: Readonly<Record<string, Uint8Array>>
    readonly authTokens?: Readonly<Record<string, Uint8Array>>
    readonly relays: readonly TokenedRelay[]
}): BinaryNode {
    const content: BinaryNode[] = [{ tag: 'key', attrs: {}, content: 'REISSUEDRELAYKEY' }]
    for (const [id, token] of Object.entries(spec.tokens)) {
        content.push({ tag: 'token', attrs: { id }, content: token })
    }
    for (const [id, token] of Object.entries(spec.authTokens ?? {})) {
        content.push({ tag: 'auth_token', attrs: { id }, content: token })
    }
    spec.relays.forEach(({ relay, tokenId, authTokenId }, index) => {
        content.push({
            tag: 'te2',
            attrs: {
                relay_name: relay.name,
                relay_id: String(index),
                token_id: tokenId,
                ...(authTokenId ? { auth_token_id: authTokenId } : {}),
                ...(relay.rtt !== undefined ? { c2r_rtt: String(relay.rtt) } : {})
            },
            content: dualStack(relay)
        })
    })
    return { tag: 'relay', attrs: { self_pid: spec.selfPid }, content }
}

test('a reissue carrying an auth token takes the ordinary path, its credentials carried', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const token = Uint8Array.of(0x71, 0x72)
    const authToken = Uint8Array.of(0xe1, 0xe2, 0xe3)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': token },
                authTokens: { '0': authToken },
                relays: [{ relay: GRU, tokenId: '0', authTokenId: '0' }]
            })
        })
    )

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.endpoints.length, 2)
    for (const endpoint of relays?.endpoints ?? []) {
        assert.equal(endpoint.transport, undefined, 'ice with its auth token, as on a 1:1 call')
        assert.ok(endpoint.authToken)
        assert.deepEqual(endpoint.rawToken, token)
        assert.deepEqual(endpoint.rawAuthToken, authToken)
        assert.equal(endpoint.authTokenId, '0')
    }
})

test('each reissue dials with the token its own token_id names, the newest winning', async () => {
    const harness = await createSession({ relayData: offerRelayData() })
    const decoy = Uint8Array.of(0x00)
    const first = Uint8Array.of(0x11)
    const second = Uint8Array.of(0x22)

    // tid 13: the elected relay names token 1.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': decoy, '1': first },
                relays: [
                    { relay: GRU, tokenId: '1' },
                    { relay: GIG, tokenId: '0' }
                ]
            })
        })
    )
    let relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.name, endpoint.rawToken]),
        [
            ['gru2c01', first],
            ['gru2c01', first],
            ['gig4c02', decoy],
            ['gig4c02', decoy]
        ]
    )

    // tid 14: the same relay at the same address now names token 0, a different token.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': second, '1': decoy },
                relays: [
                    { relay: GRU, tokenId: '0' },
                    { relay: GIG, tokenId: '1' }
                ]
            })
        })
    )
    relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 2)
    assert.deepEqual(
        relays?.endpoints.map((endpoint) => [endpoint.name, endpoint.rawToken]),
        [
            ['gru2c01', second],
            ['gru2c01', second],
            ['gig4c02', decoy],
            ['gig4c02', decoy]
        ]
    )

    // The same descriptor once more: nothing to redial.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            relay: tokenedDescriptor({
                selfPid: '0',
                tokens: { '0': second, '1': decoy },
                relays: [
                    { relay: GRU, tokenId: '0' },
                    { relay: GIG, tokenId: '1' }
                ]
            })
        })
    )
    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 2)
})

test('a self_pid of 0 is a real pid: published as 0, and told apart from no pid', async () => {
    const harness = await createSession({ relayData: { ...offerRelayData(), selfPid: undefined } })

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )
    let relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.selfPid, 0)
    assert.equal(relays?.peerPid, 0)
    assert.equal(harness.call.relayData?.selfPid, 0)

    // The same descriptor with pid 0 again is a repeat, not a change.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ relay: relayDescriptor({ selfPid: '0', relays: [GRU, GIG] }) })
    )
    relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
})

/** The server's answer to an upgrade request: `<av_upgrade>` and a roster turned to video. */
function avUpgradeUpdate(upgrader: string): BinaryNode {
    const update = groupUpdate({ transactionId: 18, roster: toRoster(THREE_WAY) })
    const inner = (update.content as BinaryNode[])[0]
    const content = (inner.content as BinaryNode[]).map((child) =>
        child.tag === 'group_info' ? { ...child, attrs: { ...child.attrs, media: 'video' } } : child
    )
    return {
        ...update,
        content: [
            {
                ...inner,
                content: [{ tag: 'av_upgrade', attrs: { 'av-upgrader': upgrader } }, ...content]
            }
        ]
    }
}

test('a group call another participant upgrades turns to video, our camera announced off', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))

    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.link.plan.video, { send: false, receive: true })
    assert.deepEqual(harness.upgrades, ['112984198234339@lid'])
    const [stopped] = sentWithTag(harness, 'video')
    assert.equal(stopped.attrs.to, `${ID}@call`)
    assert.equal(innerOf(stopped).attrs.state, '6')

    // The same update again changes nothing.
    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))
    assert.equal(sentWithTag(harness, 'video').length, 1)
})

test('our camera on a group call goes on and off through the call itself', async () => {
    const harness = await createSession({ mediaType: CallMediaType.Video })
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.setVideoEnabled(false)
    assert.equal(harness.link.plan.video?.send, false)
    assert.equal(harness.call.stateData.videoOff, true)

    await harness.session.setVideoEnabled(true)
    assert.equal(harness.link.plan.video?.send, true)
    assert.equal(harness.call.stateData.videoOff, false)

    assert.deepEqual(
        sentWithTag(harness, 'video').map((node) => [
            node.attrs.to,
            innerOf(node).attrs.state,
            innerOf(node).attrs['transaction-id']
        ]),
        [
            [`${ID}@call`, '6', '1'],
            [`${ID}@call`, '1', '2']
        ]
    )

    const plain = await createSession({ group: false })
    await assert.rejects(() => plain.session.setVideoEnabled(true), /not a group call/)
})

const THIRD_KEY = '112984198234339@lid'

function callStanza(
    from: string,
    tag: string,
    attrs: Record<string, string>,
    content?: BinaryNode[]
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `${tag}-${Math.random()}` },
        content: [{ tag, attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE, ...attrs }, content }]
    }
}

async function activeGroupSession(
    options: Parameters<typeof createSession>[0] = {}
): Promise<Harness> {
    const harness = await createSession(options)
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })
    return harness
}

test('a group mute is kept per device and reported with the device that muted', async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'mute-state': '1' }),
        PEER_DEVICE
    )
    harness.session.handleCallMuteV2(
        callStanza(THIRD_KEY, 'mute_v2', { 'mute-state': '1' }),
        THIRD_KEY
    )
    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'mute-state': '1' }),
        PEER_DEVICE
    )

    assert.deepEqual(
        harness.events.filter(([event]) => event === 'mute'),
        [
            ['mute', PEER_DEVICE, true],
            ['mute', THIRD_KEY, true]
        ]
    )
    assert.equal(harness.call.participantMedia.get(PEER_DEVICE)?.audioMuted, true)
    assert.equal(harness.call.participantMedia.get(THIRD_KEY)?.audioMuted, true)
    assert.equal(harness.call.stateData.peerAudioMuted, undefined, 'one peer is a 1:1 notion')
})

test('a mute request is reported with its raw state, and nothing is muted', async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'request-state': '1' }),
        PEER_DEVICE
    )

    assert.deepEqual(harness.events, [['mute_requested', PEER_DEVICE, '1']])
    assert.equal(harness.call.stateData.audioMuted, false)
    assert.equal(harness.link.sections('muted').length, 0)
})

test('we ask a participant to mute at its device; somebody not on the call is refused', async () => {
    const harness = await activeGroupSession()

    await harness.session.requestParticipantMute(PEER)
    await harness.session.requestParticipantMute(THIRD_DEVICE)

    assert.deepEqual(
        sentWithTag(harness, 'mute_v2').map((node) => [node.attrs.to, innerOf(node).attrs]),
        [
            [PEER_DEVICE, { 'call-id': ID, 'call-creator': PEER_DEVICE, 'request-state': '1' }],
            [THIRD_KEY, { 'call-id': ID, 'call-creator': PEER_DEVICE, 'request-state': '1' }]
        ]
    )
    await assert.rejects(() => harness.session.requestParticipantMute('424242@lid'), /not on call/)

    const plain = await createSession({ group: false })
    await assert.rejects(() => plain.session.requestParticipantMute(PEER), /not a group call/)
})

test('our own mute and hand go to the call itself on a group call, to the peer on 1:1', async () => {
    const group = await activeGroupSession()
    group.session.setMute(true)
    await group.session.setHandRaised(true)
    assert.deepEqual(
        group.sent.map((node) => [innerOf(node).tag, node.attrs.to]),
        [
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`]
        ]
    )

    const plain = await activeGroupSession({ group: false })
    plain.session.setMute(true)
    await plain.session.setHandRaised(true)
    assert.deepEqual(
        plain.sent.map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_DEVICE]
    )
})

test("a participant's video state is its own, with no upgrade handshake on a group call", async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '3' }),
        PEER_DEVICE
    )
    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '6', 'transaction-id': '1' }),
        THIRD_KEY
    )
    // An upgrade request code from a participant opens no 1:1 handshake.
    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '11', 'transaction-id': '2' }),
        THIRD_KEY
    )
    await harness.session.acceptVideoUpgrade()

    assert.equal(harness.call.participantMedia.get(PEER_DEVICE)?.video?.state, 1)
    assert.equal(harness.call.participantMedia.get(THIRD_KEY)?.video?.state, 11)
    assert.equal(harness.call.peerVideoState, undefined)
    assert.deepEqual(
        harness.events.filter(([event]) => event === 'video'),
        [
            ['video', PEER_DEVICE, 1],
            ['video', THIRD_KEY, 6],
            ['video', THIRD_KEY, 11]
        ]
    )
    assert.equal(harness.link.plan.video?.receive, true)
    assert.deepEqual(sentWithTag(harness, 'video'), [], 'nothing was there to accept')
})

test('a participant leaving takes its raised hand and its media state with it', async () => {
    const harness = await activeGroupSession()
    harness.session.handleCallUserAction(
        callStanza(THIRD_KEY, 'user_action', { action: 'raise_hand' }, [
            { tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }
        ]),
        THIRD_KEY
    )
    harness.session.handleCallMuteV2(
        callStanza(THIRD_KEY, 'mute_v2', { 'mute-state': '1' }),
        THIRD_KEY
    )
    assert.equal(harness.call.raisedHands.has(THIRD_KEY), true)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 4, roster: toRoster(THREE_WAY.slice(0, 2)) })
    )

    assert.equal(harness.call.raisedHands.size, 0)
    assert.equal(harness.call.participantMedia.has(THIRD_KEY), false)
    assert.deepEqual(harness.events.at(-1), ['hand', THIRD_KEY, false])
})

test('every sender maps back to its device, and every app-data stream is known, past 32', async () => {
    const crowd: WaGroupParticipant[] = [
        { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
        ...Array.from({ length: 40 }, (_, i) => ({
            jid: `${9000 + i}@lid`,
            devices: [`${9000 + i}:0@lid`],
            state: CONNECTED
        }))
    ]
    const harness = await createSession({ composition: crowd })
    await harness.session.applyCallKey(CALL_KEY, 1)

    assert.equal(harness.call.groupSenders.size, 40)
    const senders = lastGroup(harness.link)?.senders ?? []
    assert.equal(harness.call.groupSenders.get(senders[0].id), '9000@lid')
    assert.equal(harness.link.plan.ssrcs?.peerAppData.length, 40)
    // The app data rides in each sender's streams, which is how a reaction finds its sender.
    for (const sender of senders) {
        const device = harness.call.groupSenders.get(sender.id) as string
        assert.ok(
            sender.streams.includes(
                generateSecureSsrc(ID, device.replace('@', ':0@'), WA_SSRC_SLOT.APP_DATA.MAIN)
            )
        )
    }
})

test('each sender carries the pid its roster gave it, 0 included', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 5,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === PEER
                    ? { ...entry, pids: { [PEER_DEVICE]: '0' } }
                    : entry.jid === THIRD
                      ? { ...entry, pids: { [THIRD_DEVICE]: '2' } }
                      : entry
            )
        })
    )

    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => [
            harness.call.groupSenders.get(sender.id),
            sender.pid
        ]),
        [
            [PEER_DEVICE, 0],
            [PEER_SECOND_DEVICE, undefined],
            [THIRD_KEY, 2]
        ]
    )
})

test('the video asked of the SFU follows the cameras that are on, changed at most every 2 s', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0]

    harness.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '1' }),
        PEER_DEVICE
    )
    await Promise.resolve()
    assert.deepEqual(lastGroup(harness.link)?.videoSubscriptions, [
        { senderId: senderOf(PEER_DEVICE), quality: 0 }
    ])

    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '1', 'transaction-id': '1' }),
        THIRD_KEY
    )
    await Promise.resolve()
    assert.equal(lastGroup(harness.link)?.videoSubscriptions?.length, 1, 'held back')

    harness.clock.now += 2_000
    t.mock.timers.tick(2_000)
    await Promise.resolve()
    assert.deepEqual(
        lastGroup(harness.link)?.videoSubscriptions?.map((subscription) => subscription.senderId),
        [senderOf(PEER_DEVICE), senderOf(THIRD_KEY)]
    )
})

test('the app can choose whose video to ask for, and nobody is asked for in a call of two', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const thirdSender = harness.call.participantMedia.get(THIRD_KEY)?.senderId

    harness.session.setVideoSubscriptions([{ participantJid: THIRD_KEY, quality: 4 }])
    await Promise.resolve()
    assert.deepEqual(lastGroup(harness.link)?.videoSubscriptions, [
        { senderId: thirdSender, quality: 4 }
    ])

    const pair = await activeGroupSession({ composition: THREE_WAY.slice(0, 2) })
    await pair.session.applyCallKey(CALL_KEY, 1)
    pair.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '1' }),
        PEER_DEVICE
    )
    await Promise.resolve()
    assert.equal(lastGroup(pair.link)?.videoSubscriptions, undefined)
})

test('a member unheard for 20 s is reported invisible once, never when nobody is heard', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0] as string
    const sweep = () =>
        (harness.session as unknown as { sweepInvisibleSenders(): void }).sweepInvisibleSenders()

    // Nobody heard: our own path is down, nobody is accused.
    sweep()
    harness.clock.now += 25_000
    sweep()
    assert.deepEqual(sentWithTag(harness, 'peer_state'), [])

    // One device of PEER heard: PEER is on the call, whatever its other device does.
    harness.session.handleSenderMedia(senderOf(PEER_DEVICE), true)
    sweep()
    harness.clock.now += 21_000
    sweep()
    sweep()

    const reports = sentWithTag(harness, 'peer_state')
    assert.equal(reports.length, 1, 'once')
    assert.equal(reports[0].attrs.to, `${ID}@call`)
    const report = innerOf(reports[0])
    assert.equal(report.attrs['call-id'], ID)
    assert.match(report.attrs.t, /^\d+$/)
    assert.deepEqual(
        (report.content as BinaryNode[]).map((user) => user.attrs),
        [{ state: 'invisible', jid: THIRD }]
    )
    assert.deepEqual(harness.events, [['participant_media', PEER_DEVICE, true]])
})

test('a member heard again can be reported again later', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0] as string
    const sweep = () =>
        (harness.session as unknown as { sweepInvisibleSenders(): void }).sweepInvisibleSenders()
    harness.session.handleSenderMedia(senderOf(PEER_DEVICE), true)

    sweep()
    harness.clock.now += 21_000
    sweep()
    harness.session.handleSenderMedia(senderOf(THIRD_KEY), true)
    harness.session.handleSenderMedia(senderOf(THIRD_KEY), false)
    harness.clock.now += 19_000
    sweep()
    assert.equal(sentWithTag(harness, 'peer_state').length, 1, 'not yet: silent for 19 s')
    harness.clock.now += 2_000
    sweep()
    assert.equal(sentWithTag(harness, 'peer_state').length, 2)
})

test('a re-rung group offer with no relay takes the one the ack of our accept brings', async () => {
    const harness = await createSession()
    await harness.session.acceptCall()
    assert.equal(harness.link.plan.relays, null, 'nothing to dial yet')

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept', from: `${ID}@call` },
        content: [relayDescriptor({ selfPid: '2', relays: [GRU] })]
    })

    const relays = relaysPublished(harness.link).at(-1)
    assert.equal(relays?.generation, 1)
    assert.equal(relays?.selfPid, 2)

    // A 1:1 accept ack is left alone, as before.
    const plain = await createSession({ group: false, relayData: offerRelayData() })
    const before = relaysPublished(plain.link).length
    await plain.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept' },
        content: [relayDescriptor({ selfPid: '2', relays: [GRU] })]
    })
    assert.equal(relaysPublished(plain.link).length, before)
})

test('a group reject goes to the call itself with count 0', async () => {
    const harness = await createSession()

    await harness.session.rejectCall()

    const [reject] = sentWithTag(harness, 'reject')
    assert.equal(reject.attrs.to, `${ID}@call`)
    assert.equal(innerOf(reject).attrs.count, '0')
})

test('reactions and video are attributed to the sender device they came from', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const [first] = lastGroup(harness.link)?.senders ?? []

    harness.link.events.onReaction({ transactionId: 1n, reaction: 'R1' }, first.id)
    harness.link.events.onInboundVideoRtp({
        payloadType: 97,
        sequenceNumber: 1,
        timestamp: 1,
        ssrc: 7,
        marker: false,
        payload: new Uint8Array(),
        senderId: first.id
    })
    harness.link.events.onReaction({ transactionId: 2n, reaction: 'R2' }, 'unknown')

    assert.deepEqual(harness.events, [
        ['reaction', PEER_DEVICE, 'R1'],
        ['video_rtp', PEER_DEVICE, 7],
        ['reaction', undefined, 'R2']
    ])
})

test('a joinable offer with no roster and no group jid, as WA Web offers every 1:1, is 1:1', async () => {
    const harness = await createSession({ group: false })
    harness.call.joinable = true

    await harness.session.sendIncomingPreaccept(PEER_DEVICE)

    assert.equal(harness.call.isGroupCall, false)
    const [preaccept] = sentWithTag(harness, 'preaccept')
    assert.equal(preaccept.attrs.to, PEER_DEVICE, 'to the caller device, not to the call')
})

test('the av-upgradable marker every call carries is no upgrade; av-upgrader is', async () => {
    const harness = await activeGroupSession()
    const marker = groupUpdate({ transactionId: 17, roster: toRoster(THREE_WAY) })
    const inner = (marker.content as BinaryNode[])[0]
    const withMarker: BinaryNode = {
        ...marker,
        content: [
            {
                ...inner,
                content: [
                    { tag: 'av_upgrade', attrs: { 'av-upgradable': '1' } },
                    ...(inner.content as BinaryNode[])
                ]
            }
        ]
    }

    await harness.session.handleCallGroupUpdate(withMarker)
    assert.equal(harness.call.mediaType, CallMediaType.Audio)
    assert.deepEqual(harness.upgrades, [])
    assert.deepEqual(sentWithTag(harness, 'video'), [])

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))
    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.upgrades, [THIRD_KEY])
    assert.equal(innerOf(sentWithTag(harness, 'video')[0]).attrs.state, '6')
})

test('no video leaves once our group camera is off', async () => {
    const harness = await activeGroupSession({ mediaType: CallMediaType.Video })
    let framesSent = 0
    harness.link.sendVideoFrame = () => {
        framesSent++
        return 3
    }

    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 0), 3)
    await harness.session.setVideoEnabled(false)
    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 1), 0)
    assert.equal(framesSent, 1)

    await harness.session.setVideoEnabled(true)
    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 2), 3)
})

test('a group call joined after its ring accepts to the call and takes its relay from the update', async () => {
    const info = CallInfo.newGroupJoin(ID, PEER_DEVICE, CallMediaType.Audio, GROUP_JID)
    const harness = await createSession({ info })
    harness.session.seedGroupJoin({
        participants: toRoster(THREE_WAY).map((entry) => ({
            jid: entry.jid,
            devices: entry.devices,
            state: entry.jid === SELF ? 'invited' : CONNECTED
        })),
        transactionId: 21
    })

    await harness.session.acceptCall()

    const [accept] = sentWithTag(harness, 'accept')
    assert.equal(accept.attrs.to, `${ID}@call`)
    assert.deepEqual(sentWithTag(harness, 'preaccept'), [], 'a join opens no ring of its own')
    assert.equal(harness.link.plan.relays, null)

    // The server answers the joiner with the roster, its relay, and the rekey to run.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 22,
            rekey: true,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '2', relays: [GRU, GIG] })
        })
    )

    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
    assert.deepEqual(
        sentWithTag(harness, 'enc_rekey').map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]
    )
    assert.ok(harness.call.encryptionKey)
    assert.equal(harness.call.groupComposition?.lastTransactionId, 22)
})

test('a group call sends the call a heartbeat every 10 s from the accept, and stops at the end', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ relayData: offerRelayData() })
    const heartbeats = () => sentWithTag(harness, 'heartbeat')

    await harness.session.acceptCall()
    assert.equal(heartbeats().length, 1)
    assert.equal(heartbeats()[0].attrs.to, `${ID}@call`)
    assert.deepEqual(innerOf(heartbeats()[0]).attrs, { 'call-id': ID, 'call-creator': PEER_DEVICE })

    t.mock.timers.tick(10_000)
    t.mock.timers.tick(10_000)
    assert.equal(heartbeats().length, 3)

    // Media going active does not start a second timer.
    harness.link.events.onActive()
    t.mock.timers.tick(10_000)
    assert.equal(heartbeats().length, 4)

    await harness.session.leaveCall()
    t.mock.timers.tick(30_000)
    assert.equal(heartbeats().length, 4)
})

test('the heartbeat follows the server interval, and stops when the call is ended for us', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ relayData: offerRelayData() })
    harness.session.applyVoipSettings(
        WaVoipSettings.fromJson(JSON.stringify({ options: { heartbeat_interval_s: '5' } }))
    )

    await harness.session.acceptCall()
    t.mock.timers.tick(5_000)
    assert.equal(sentWithTag(harness, 'heartbeat').length, 2)

    // The manager ending the call here (user_invisible) runs the session's cleanup.
    harness.session.cleanup()
    t.mock.timers.tick(60_000)
    assert.equal(sentWithTag(harness, 'heartbeat').length, 2)
})

test('a 1:1 call sends no heartbeat', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ group: false, relayData: offerRelayData() })
    harness.call.encryptionKey = CALL_KEY

    await harness.session.acceptCall()
    harness.link.events.onActive()
    t.mock.timers.tick(30_000)

    assert.deepEqual(sentWithTag(harness, 'heartbeat'), [])
})

test('somebody arriving gets our mute state again, and our hand only while it is up', async () => {
    const harness = await activeGroupSession()
    harness.session.setMute(true)
    const sentBefore = harness.sent.length
    const afterJoin = () =>
        harness.sent
            .slice(sentBefore)
            .map((node) => [innerOf(node).tag, node.attrs.to, innerOf(node).attrs['mute-state']])

    const fourWay = [...THREE_WAY, { jid: FOURTH, devices: [FOURTH_DEVICE], state: 'outgoing' }]
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 5, roster: toRoster(fourWay) })
    )
    assert.deepEqual(afterJoin(), [['mute_v2', `${ID}@call`, '1']])

    // The same roster again brings nobody.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 6, roster: toRoster(fourWay) })
    )
    assert.equal(afterJoin().length, 1)

    // Hand up, and the newcomer connects: both go out again.
    await harness.session.setHandRaised(true)
    const connected = fourWay.map((entry) => ({ ...entry, state: CONNECTED }))
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 7, roster: toRoster(connected) })
    )
    assert.deepEqual(
        afterJoin().map(([tag, to]) => [tag, to]),
        [
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`],
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`]
        ]
    )
    assert.deepEqual(sentWithTag(harness, 'video'), [], 'video is not replayed')
})

test('a connected member listed with no device is never reported invisible', async () => {
    const harness = await activeGroupSession({
        composition: [...THREE_WAY, { jid: FOURTH, devices: [], state: CONNECTED }]
    })
    await harness.session.applyCallKey(CALL_KEY, 1)
    const peerSender = [...harness.call.groupSenders].find(([, jid]) => jid === PEER_DEVICE)?.[0]
    harness.session.handleSenderMedia(peerSender as string, true)
    harness.session.handleSenderMedia(
        [...harness.call.groupSenders].find(([, jid]) => jid === THIRD_KEY)?.[0] as string,
        true
    )
    ;(harness.session as unknown as { sweepInvisibleSenders(): void }).sweepInvisibleSenders()

    assert.deepEqual(sentWithTag(harness, 'peer_state'), [])
})

test('a mute request for a device not on the roster is refused, an account names its first', async () => {
    const harness = await activeGroupSession()

    await harness.session.requestParticipantMute(PEER)
    await harness.session.requestParticipantMute(PEER_SECOND_DEVICE)
    await assert.rejects(
        () => harness.session.requestParticipantMute('50062877036657:99@lid'),
        /not on call/
    )

    assert.deepEqual(
        sentWithTag(harness, 'mute_v2').map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE]
    )
})
