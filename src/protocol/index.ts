export * from '@protocol/constants'
export {
    applyDeviceToJid,
    buildDeviceJid,
    canonicalizeSignalJid,
    canonicalizeSignalServer,
    getLoginIdentity,
    isBotJid,
    isBroadcastJid,
    isGroupJid,
    isGroupOrBroadcastJid,
    isHostedDeviceId,
    isHostedDeviceJid,
    isHostedServer,
    isLidJid,
    isNewsletterJid,
    isStatusBroadcastJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    parseJidFull,
    parsePhoneJid,
    parseSignalAddressFromJid,
    signalAddressKey,
    splitJid,
    toUserJid
} from '@protocol/jid'
export type { ParsedJid } from '@protocol/jid'
