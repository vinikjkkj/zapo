import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { toError } from 'zapo-js/util'

import type { WaCallMediaKeys, WaCallMediaSsrcs } from '@zapo-js/voip-media'

import { WA_AUDIO_CALL_SSRC_SLOTS, WA_SSRC_SLOT, WA_VIDEO_CALL_SSRC_SLOTS } from '../crypto/ssrc.js'
import { relayListedDeviceJid, toDeviceJid } from '../jid.js'
import { CallMediaType, type WaVoipDeps } from '../types.js'

import { selfJidOf } from './call-jids.js'
import type { CallInfo } from './call-state.js'
import type { GroupSenders, WaCallDerivations } from './group-media-plan.js'
import { samePlanValue, VIDEO_ONLY_SSRC_SLOTS } from './media-plan.js'

/** Memory guard on a set fed straight from remote stanzas, one per peer device. */
const MAX_TRACKED_PEER_APP_DATA_SSRCS = 32

export interface WaCallStreamsOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly deps: Pick<WaVoipDeps, 'authClient'>
    readonly derivations: WaCallDerivations
}

/** The SSRC sets and versioned SRTP keys one call publishes, derived per device. */
export class WaCallStreams {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly deps: Pick<WaVoipDeps, 'authClient'>
    private readonly derivations: WaCallDerivations

    /** The SSRC lists of the plan as last derived; published whole as `ssrcs` on any change. */
    private selfStreamSsrcs: number[] = []
    private peerAudioSsrc = 0
    private peerStreamSsrcs: number[] = []
    private peerVideoStreamSsrcs: number[] = []
    /** App-data SSRCs of the peer's devices: inbound app data is recognized by SSRC alone. */
    private readonly peerAppDataSsrcs = new Set<number>()
    /** Bumped when the SRTP keys change, so the media rebuilds its contexts only then. */
    private keyEpoch = 0
    private lastKeys: WaCallMediaKeys | null = null
    /** Our own device jid, as the SSRC derivation takes it. */
    private selfDeviceJid = ''

    constructor(options: WaCallStreamsOptions) {
        this.info = options.info
        this.logger = options.logger
        this.deps = options.deps
        this.derivations = options.derivations
    }

    /** Our own device jid, empty until the media is initialized or the ack names it. */
    get deviceJid(): string {
        return this.selfDeviceJid
    }

    /** Derives the streams of a call about to start, ours and the peer's. */
    initialize(selfLid: string, peerJid: string): void {
        const selfDeviceJid = toDeviceJid(selfLid)
        const peerDeviceJid = toDeviceJid(peerJid)
        this.selfDeviceJid = selfDeviceJid
        const relaySlots = this.relaySlots
        this.selfStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(selfDeviceJid, slot))
        this.peerStreamSsrcs = relaySlots.map((slot) => this.ssrcOf(peerDeviceJid, slot))
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => toDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([peerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([peerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([peerDeviceJid])
        }
        this.peerAudioSsrc = this.peerStreamSsrcs[0]
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(toDeviceJid(this.info.peerJid))

        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${this.selfStreamSsrcs[0].toString(16).toUpperCase()}`,
            peerSsrc: `0x${this.peerAudioSsrc.toString(16).toUpperCase()}`
        })
    }

    /** Our accept took the call: the offer's sender is the peer we hear. */
    subscribeAnswered(acceptedPeerDeviceJid: string): void {
        this.peerAudioSsrc = this.ssrcOf(acceptedPeerDeviceJid)
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
    }

    /** The peer accepted a call we placed: its answering device's streams replace the others. */
    subscribeAccepted(acceptedPeerDeviceJid: string, acceptingDeviceJid: string): void {
        // A stream of the peer already seen on the wire outranks this, and the media keeps it.
        this.peerAudioSsrc = this.ssrcOf(acceptedPeerDeviceJid)
        this.logger.debug('accept ssrc assigned', {
            callId: this.info.callId,
            jid: acceptedPeerDeviceJid,
            ssrc: `0x${this.peerAudioSsrc.toString(16)}`
        })
        this.peerStreamSsrcs = this.relaySlots.map((slot) =>
            this.ssrcOf(acceptedPeerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(acceptingDeviceJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => toDeviceJid(jid))
            this.peerStreamSsrcs = this.audioStreamsOf([acceptedPeerDeviceJid, ...peerDevices])
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid, ...peerDevices])
        } else {
            this.trackPeerAppDataSsrcs([acceptedPeerDeviceJid])
        }
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(acceptedPeerDeviceJid)
    }

    /** The participants the ack of our offer lists: our device as the relay names it, and the peer's. */
    subscribeFromOfferAck(participantJids: readonly string[], acceptedByJid: string | null): void {
        const ourJid = selfJidOf(this.deps)
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const ourDeviceJid = toDeviceJid(this.relayDeviceJid())
        this.selfDeviceJid = ourDeviceJid

        // Until an accept names the answering device, every device of the peer is subscribed.
        const peerDevices = acceptedByJid
            ? [toDeviceJid(acceptedByJid)]
            : Array.from(
                  new Set(
                      participantJids
                          .filter((jid) => toUserJid(jid) !== ourBase)
                          .map((jid) => toDeviceJid(jid))
                  )
              )

        if (this.info.mediaType === CallMediaType.Video) {
            this.selfStreamSsrcs = WA_VIDEO_CALL_SSRC_SLOTS.map((slot) =>
                this.ssrcOf(ourDeviceJid, slot)
            )
            if (peerDevices.length > 0) {
                this.peerStreamSsrcs = Array.from(
                    new Set(
                        peerDevices.flatMap((jid) =>
                            WA_VIDEO_CALL_SSRC_SLOTS.map((slot) => this.ssrcOf(jid, slot))
                        )
                    )
                )
            }
        } else if (!acceptedByJid && peerDevices.length > 0) {
            this.peerStreamSsrcs = this.audioStreamsOf(peerDevices)
        }

        if (acceptedByJid) this.peerAudioSsrc = this.ssrcOf(peerDevices[0])
        this.trackPeerAppDataSsrcs(peerDevices)
    }

    /** Subscribes the peer's video streams, on a call whose video receiving just opened. */
    openPeerVideo(peerDeviceJid: string): void {
        this.peerVideoStreamSsrcs = this.peerVideoStreamsOf(peerDeviceJid)
    }

    /** The plan's `ssrcs`; with `group`, every sender's streams in place of the 1:1 sets. */
    build(group?: GroupSenders): WaCallMediaSsrcs {
        const self = this.selfDeviceJid
        const base: WaCallMediaSsrcs = {
            selfAudio: self ? this.ssrcOf(self, WA_SSRC_SLOT.AUDIO.MAIN) : 0,
            selfVideo: self ? this.ssrcOf(self, WA_SSRC_SLOT.VIDEO.MAIN) : 0,
            selfAppData: self ? this.ssrcOf(self, WA_SSRC_SLOT.APP_DATA.MAIN) : 0,
            selfStreams: [...this.selfStreamSsrcs],
            selfVideoStreams: self ? this.videoOnlyStreamsOf(self) : [],
            peerAudio: this.peerAudioSsrc,
            peerStreams: [...this.peerStreamSsrcs],
            peerVideoStreams: [...this.peerVideoStreamSsrcs],
            peerAppData: [...this.peerAppDataSsrcs]
        }
        if (!group) return base

        // Every sender's streams and app data, in place of the 1:1 sets.
        const peerStreams = new Set<number>()
        const peerAppData: number[] = []
        for (const deviceJid of group.devices) {
            for (const ssrc of group.streamsOf(deviceJid)) peerStreams.add(ssrc)
            peerAppData.push(this.ssrcOf(deviceJid, WA_SSRC_SLOT.APP_DATA.MAIN))
        }
        return {
            ...base,
            peerStreams: peerStreams.size > 0 ? [...peerStreams] : base.peerStreams,
            peerAppData: peerAppData.length > 0 ? peerAppData : base.peerAppData,
            selfLayers: this.derivations.selfStreamLayers(self)
        }
    }

    /** Keeps the last epoch for unchanged keys, so the media's SRTP contexts keep their state. */
    versionKeys(send: WaCallMediaKeys['send'], recv: WaCallMediaKeys['recv']): WaCallMediaKeys {
        const last = this.lastKeys
        if (last && samePlanValue(last.send, send) && samePlanValue(last.recv, recv)) {
            return last
        }
        this.lastKeys = { epoch: ++this.keyEpoch, send, recv }
        return this.lastKeys
    }

    /**
     * Derives the SRTP keys from the call key: ours to send, `peerJid`'s to receive. `null`
     * without a call key or on failure, leaving the media's keys as they were.
     */
    deriveKeys(peerJid: string): WaCallMediaKeys | null {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return null
        }

        const ourDeviceJid = toDeviceJid(this.relayDeviceJid())
        if (!ourDeviceJid) {
            this.logger.debug('no own jid, srtp not initialized', { callId: this.info.callId })
            return null
        }
        const peerDeviceJid = toDeviceJid(peerJid)

        try {
            const keys = this.versionKeys(
                this.derivations.srtpKey(callKey, ourDeviceJid),
                this.derivations.srtpKey(callKey, peerDeviceJid)
            )
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJid: peerDeviceJid
            })
            return keys
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
            return null
        }
    }

    /** Our device as the relay lists it among the participants, else our account jid. */
    relayDeviceJid(): string {
        return relayListedDeviceJid(
            selfJidOf(this.deps),
            this.info.relayData?.participantJids || []
        )
    }

    private get relaySlots(): readonly number[] {
        return this.info.mediaType === CallMediaType.Video
            ? WA_VIDEO_CALL_SSRC_SLOTS
            : WA_AUDIO_CALL_SSRC_SLOTS
    }

    private ssrcOf(deviceJid: string, slot = 0): number {
        return this.derivations.ssrc(deviceJid, slot)
    }

    /** The audio and app-data streams of every device listed, each once. */
    private audioStreamsOf(deviceJids: readonly string[]): number[] {
        return Array.from(
            new Set(
                deviceJids.flatMap((jid) => [
                    this.ssrcOf(jid, WA_SSRC_SLOT.AUDIO.MAIN),
                    this.ssrcOf(jid, WA_SSRC_SLOT.APP_DATA.MAIN)
                ])
            )
        )
    }

    /** The streams video adds to a device's registration: {@link VIDEO_ONLY_SSRC_SLOTS}. */
    private videoOnlyStreamsOf(deviceJid: string): number[] {
        return VIDEO_ONLY_SSRC_SLOTS.map((slot) => this.ssrcOf(deviceJid, slot))
    }

    /** The peer's three video streams, subscribed to once its video can arrive. */
    private peerVideoStreamsOf(peerDeviceJid: string): number[] {
        return [WA_SSRC_SLOT.VIDEO.MAIN, WA_SSRC_SLOT.VIDEO.FEC, WA_SSRC_SLOT.VIDEO.OOB_NACK].map(
            (slot) => this.ssrcOf(peerDeviceJid, slot)
        )
    }

    private trackPeerAppDataSsrcs(deviceJids: readonly string[]): void {
        for (const jid of deviceJids) {
            if (!jid) continue
            if (this.peerAppDataSsrcs.size >= MAX_TRACKED_PEER_APP_DATA_SSRCS) break
            this.peerAppDataSsrcs.add(this.ssrcOf(jid, WA_SSRC_SLOT.APP_DATA.MAIN))
        }
    }
}
