/** Catalog wire constants used by the business coordinator.
 * The application token is a public client identifier shipped by WhatsApp, not an account credential.
 * Query IDs and endpoints follow the upstream protocol and may change between library releases.
 * @example `const timeoutMs = WA_CATALOG.QUERY_TIMEOUT_MS`
 */
export const WA_CATALOG = Object.freeze({
    PUBLIC_APPLICATION_TOKEN: 'WA|787118555984857|7bb1544a3599aa180ac9a3f7688ba243',
    PUBLIC_ENDPOINT: 'https://graph.whatsapp.com/graphql/catalog',
    OWNER_ENDPOINT: 'https://graph.facebook.com/graphql',
    AUTH_XMLNS: 'fb:thrift_iq',
    NONCE_SMAX_ID: '118',
    TOKEN_SMAX_ID: '104',
    RECOVERY_USE_CASE: '547',
    NONCE_WAIT_MS: 20_000,
    QUERY_TIMEOUT_MS: 32_000,
    MAX_RESPONSE_BYTES: 4 * 1_024 * 1_024,
    PUBLIC_CATALOG_QUERY: '30445081048424116',
    OWNER_CATALOG_QUERY: '9957894520961099',
    PUBLIC_PRODUCT_QUERY: '9660926520672123',
    OWNER_PRODUCT_QUERY: '24529100180014015'
} as const)
