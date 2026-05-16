import { TEXT_ENCODER } from '@util/bytes'

export const WA_SIGNALING = Object.freeze({
    LINK_CODE_STAGE_COMPANION_HELLO: 'companion_hello',
    LINK_CODE_STAGE_GET_COUNTRY_CODE: 'get_country_code',
    LINK_CODE_STAGE_COMPANION_FINISH: 'companion_finish',
    LINK_CODE_STAGE_REFRESH_CODE: 'refresh_code',
    LINK_CODE_STAGE_PRIMARY_HELLO: 'primary_hello',
    COMPANION_REG_REFRESH_NOTIFICATION: 'companion_reg_refresh'
} as const)

export const WA_PAIRING_KDF_INFO = Object.freeze({
    LINK_CODE_BUNDLE: TEXT_ENCODER.encode('link_code_pairing_key_bundle_encryption_key'),
    ADV_SECRET: TEXT_ENCODER.encode('adv_secret')
} as const)
