import type { Logger } from 'zapo-js'
import { toError } from 'zapo-js/util'

import { generateCallKey } from '../crypto/encryption.js'
import { groupParticipantAccountKey } from '../jid.js'
import { buildEncRekeyStanza } from '../signaling/group-call.js'
import type { GroupInfoParticipant } from '../signaling/group-info.js'
import type { WaVoipDeps } from '../types.js'

import type { CallInfo } from './call-state.js'
import { WA_CALL_PARTICIPANT_STATE } from './group-participants.js'
import type { WaCallStanzaSender } from './WaCallStanzaSender.js'
import type { WaGroupRoster } from './WaGroupRoster.js'

export interface WaGroupRekeyOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly deps: WaVoipDeps
    readonly stanzas: WaCallStanzaSender
    readonly roster: Pick<WaGroupRoster, 'accountKeyOf' | 'selfAccountKey'>
    /** Installs the new call key and publishes it, before any `<enc_rekey>` leaves. */
    readonly installKey: (callKey: Uint8Array, transactionId: number) => Promise<void>
}

/** The rekeys a group call's `<group_info>` asks of us: each run once, minted and fanned out. */
export class WaGroupRekey {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly deps: WaVoipDeps
    private readonly stanzas: WaCallStanzaSender
    private readonly roster: Pick<WaGroupRoster, 'accountKeyOf' | 'selfAccountKey'>
    private readonly installKey: (callKey: Uint8Array, transactionId: number) => Promise<void>
    /** The highest `transaction-id` whose rekey this side ran; ordered apart from rosters. */
    private lastHonouredRekeyTransactionId: number | null = null

    constructor(options: WaGroupRekeyOptions) {
        this.info = options.info
        this.logger = options.logger
        this.deps = options.deps
        this.stanzas = options.stanzas
        this.roster = options.roster
        this.installKey = options.installKey
    }

    /** Whether the rekey announced under `transactionId` is ours to run; records it when it is. */
    accept(transactionId: number): boolean {
        const honoured = this.lastHonouredRekeyTransactionId
        if (honoured !== null && transactionId <= honoured) {
            this.logger.debug('group rekey already answered at this transaction id or newer', {
                callId: this.info.callId,
                transactionId,
                honouredTransactionId: honoured
            })
            return false
        }
        this.lastHonouredRekeyTransactionId = transactionId
        return true
    }

    /**
     * Runs the rekey a `<group_info rekey>` makes us master of: a new call key, installed and sent
     * in one `<enc_rekey>` per device of every other connected participant but `tos_not_accepted`.
     */
    async run(transactionId: number, listed: readonly GroupInfoParticipant[]): Promise<void> {
        const composition = this.info.groupComposition
        const selfKey = this.roster.selfAccountKey()
        if (composition === undefined || selfKey === null) {
            this.logger.warn('group rekey asked of us, not run', {
                callId: this.info.callId,
                transactionId,
                reason: composition === undefined ? 'no_composition' : 'no_self_jid'
            })
            return
        }

        const connected = composition.participants.filter(
            (participant) => participant.state === WA_CALL_PARTICIPANT_STATE.Connected
        )
        const selfConnected = connected.some(
            (participant) => this.roster.accountKeyOf(participant) === selfKey
        )
        if (!selfConnected || connected.length < 2) {
            this.logger.debug('group rekey asked of us, not run', {
                callId: this.info.callId,
                transactionId,
                reason: selfConnected ? 'nobody_else_connected' : 'self_not_connected',
                connectedCount: connected.length
            })
            return
        }

        const termsNotAccepted = new Set(
            listed
                .filter((participant) => participant.tosNotAccepted)
                .map((participant) => groupParticipantAccountKey(participant.jid))
        )

        const callKey = generateCallKey()
        await this.installKey(callKey, transactionId)

        let sent = 0
        let skipped = 0
        let lastError = ''
        const failed: string[] = []
        for (const participant of connected) {
            const accountKey = this.roster.accountKeyOf(participant)
            if (accountKey === selfKey) continue
            if (termsNotAccepted.has(accountKey)) {
                skipped++
                continue
            }
            for (const deviceJid of participant.devices) {
                try {
                    const stanza = await buildEncRekeyStanza(this.deps, {
                        callId: this.info.callId,
                        callCreator: this.info.callCreator,
                        transactionId,
                        peerDeviceJid: deviceJid,
                        callKey
                    })
                    await this.stanzas.send(stanza)
                    sent++
                } catch (err) {
                    failed.push(deviceJid)
                    lastError = toError(err).message
                }
            }
        }

        if (failed.length > 0) {
            this.logger.warn('group rekey did not reach every device', {
                callId: this.info.callId,
                transactionId,
                message: lastError,
                droppedCount: failed.length,
                totalExpected: sent + failed.length,
                sample: failed.slice(0, 3)
            })
        }
        this.logger.debug('group rekey distributed', {
            callId: this.info.callId,
            transactionId,
            connectedCount: connected.length,
            sent,
            failed: failed.length,
            skipped
        })
    }
}
