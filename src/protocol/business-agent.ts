/** Persisted Facebook HTTP operations used by the native Business Agent drawer. */
export const WA_BUSINESS_AGENT = Object.freeze({
    ENDPOINT: 'https://graph.facebook.com/graphql',
    AUTH_XMLNS: 'fb:thrift_iq',
    REQUEST_NONCE: '118',
    EXCHANGE_NONCE: '104',
    NONCE_TAG: 'wa_ad_account_nonce',
    AUTH_TIMEOUT_MS: 32_000,
    HTTP_TIMEOUT_MS: 30_000,
    MAX_BYTES: 2_097_152,
    DOCUMENTS: Object.freeze({
        status: '27855405457379489',
        eligibility: '27140128522251730',
        availability: '27287965697525752',
        settings: '28169016829397830',
        settingsAvailability: '38891021877207639',
        updateSettings: '27987559807539263',
        conversationReplies: '27338647792432014',
        reengagement: '27136574649299744'
    })
})
