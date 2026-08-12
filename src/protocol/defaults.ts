import { getWaCompanionPlatformId, WA_BROWSERS } from '@protocol/browser'

export const WA_DEFAULTS = Object.freeze({
    HOST_DOMAIN: 's.whatsapp.net',
    GROUP_SERVER: 'g.us',
    BROADCAST_SERVER: 'broadcast',
    LID_SERVER: 'lid',
    HOSTED_SERVER: 'hosted',
    HOSTED_LID_SERVER: 'hosted.lid',
    HOSTED_DEVICE_ID: 99,
    MSGR_SERVER: 'msgr',
    INTEROP_SERVER: 'interop',
    NEWSLETTER_SERVER: 'newsletter',
    BOT_SERVER: 'bot',
    STATUS_BROADCAST_JID: 'status@broadcast',
    DEVICE_BROWSER: WA_BROWSERS.FIREFOX,
    DEVICE_PLATFORM: getWaCompanionPlatformId(WA_BROWSERS.FIREFOX),
    CHAT_SOCKET_URLS: ['wss://web.whatsapp.com/ws/chat', 'wss://web.whatsapp.com:5222/ws/chat'],
    NOISE_RESUME_FAILURES_BEFORE_FULL_HANDSHAKE: 1,
    IQ_TIMEOUT_MS: 15_000,
    /**
     * Quiet window before an `account_sync` privacy notification triggers the
     * refetch, so flipping several settings in a row on the phone collapses
     * into one refresh instead of one per notification.
     */
    PRIVACY_ACCOUNT_SYNC_DEBOUNCE_MS: 1_000,
    NODE_QUERY_TIMEOUT_MS: 15_000,
    CONNECT_TIMEOUT_MS: 10_000,
    SOCKET_TIMEOUT_MS: 10_000,
    RECONNECT_INTERVAL_MS: 2_000,
    HEALTH_CHECK_INTERVAL_MS: 15_000,
    DEAD_SOCKET_TIMEOUT_MS: 20_000,
    MEDIA_TIMEOUT_MS: 30_000,
    /**
     * How long a media-reupload request waits for the `mediaretry`
     * notification. The sender's primary device has to be reachable and
     * re-upload the file, so this is deliberately longer than an IQ timeout.
     */
    MEDIA_RETRY_TIMEOUT_MS: 60_000,
    /** In-flight media-reupload requests kept in memory; the oldest is rejected past it. */
    MAX_PENDING_MEDIA_RETRIES: 64,
    APP_STATE_SYNC_TIMEOUT_MS: 30_000,
    SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS: 20_000,
    MESSAGE_ACK_TIMEOUT_MS: 10_000,
    MESSAGE_MAX_ATTEMPTS: 3,
    MESSAGE_RETRY_DELAY_MS: 750,
    PAIRING_CODE_MAX_AGE_SECONDS: 180,
    PAIRING_CODE_MAX_PRIMARY_HELLOS: 3,
    QR_INITIAL_TTL_MS: 60_000,
    QR_ROTATION_TTL_MS: 20_000,
    MAX_DANGLING_RECEIPTS: 2_048
} as const)
