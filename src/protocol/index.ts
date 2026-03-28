export * from '@protocol/constants'
export {
    buildDeviceJid,
    canonicalizeSignalJid,
    canonicalizeSignalServer,
    getLoginIdentity,
    isHostedDeviceId,
    isHostedDeviceJid,
    isHostedServer,
    isGroupJid,
    normalizeDeviceJid,
    normalizeRecipientJid,
    parsePhoneJid,
    parseSignalAddressFromJid,
    splitJid,
    signalAddressKey,
    toUserJid
} from '@protocol/jid'
