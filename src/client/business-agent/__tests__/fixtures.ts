import type { BinaryNode } from '@transport/types'

export function nonceNotification(code = 'fixture-nonce'): BinaryNode {
    return {
        tag: 'notification',
        attrs: { id: 'nonce-1', type: 'business', from: 's.whatsapp.net' },
        content: [{ tag: 'wa_ad_account_nonce', attrs: {}, content: code }]
    }
}

export function nonceResult(): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [{ tag: 'result', attrs: { status: 'Success' } }]
    }
}

export function tokenResult(): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            { tag: 'business_person', attrs: { id: '12345' } },
            { tag: 'access_token', attrs: {}, content: 'fixture-private-token' },
            {
                tag: 'session_cookies',
                attrs: {},
                content: '[{"name":"fixture","value":"private-cookie"}]'
            }
        ]
    }
}
