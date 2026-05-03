import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmailCoordinator } from '@client/coordinators/WaEmailCoordinator'
import { WA_EMAIL_CONTEXTS, WA_EMAIL_ERROR_CODES, WA_EMAIL_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

function iqResult(content?: readonly BinaryNode[]): BinaryNode {
    return { tag: 'iq', attrs: { type: 'result' }, content }
}

function iqError(code: number, text = 'oops'): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'error' },
        content: [{ tag: 'error', attrs: { code: String(code), text } }]
    }
}

test('email coordinator parses get/set status with email_address and confirmed children', async () => {
    const calls: Array<{ context: string; node: BinaryNode }> = []
    const coordinator = createEmailCoordinator({
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return iqResult([
                {
                    tag: WA_EMAIL_TAGS.EMAIL,
                    attrs: { verified: 'true' },
                    content: [
                        {
                            tag: WA_EMAIL_TAGS.EMAIL_ADDRESS,
                            attrs: {},
                            content: 'foo@bar.com'
                        },
                        { tag: WA_EMAIL_TAGS.CONFIRMED, attrs: {}, content: 'true' }
                    ]
                }
            ])
        }
    })

    const status = await coordinator.getStatus()
    assert.deepEqual(status, { email: 'foo@bar.com', verified: true, confirmed: true })
    assert.equal(calls[0].context, 'email.getStatus')
    assert.equal(calls[0].node.attrs.type, 'get')

    const setStatus = await coordinator.setEmail('foo@bar.com', WA_EMAIL_CONTEXTS.ONBOARDING)
    assert.equal(setStatus.email, 'foo@bar.com')
    assert.equal(calls[1].context, 'email.set')
    assert.equal(calls[1].node.attrs.type, 'set')
})

test('email coordinator returns empty status when no email child is present', async () => {
    const coordinator = createEmailCoordinator({
        queryWithContext: async () => iqResult()
    })
    const status = await coordinator.getStatus()
    assert.deepEqual(status, { email: null, verified: false, confirmed: false })
})

test('email coordinator parses verifyCode result and detects auto_verify=fail', async () => {
    const coordinator = createEmailCoordinator({
        queryWithContext: async () =>
            iqResult([
                {
                    tag: WA_EMAIL_TAGS.EMAIL,
                    attrs: { do_verify: 'true' },
                    content: [
                        { tag: WA_EMAIL_TAGS.AUTO_VERIFY, attrs: {}, content: 'fail' },
                        {
                            tag: WA_EMAIL_TAGS.EMAIL_ADDRESS,
                            attrs: {},
                            content: 'foo@bar.com'
                        }
                    ]
                }
            ])
    })

    const result = await coordinator.verifyCode('123456')
    assert.deepEqual(result, {
        verified: true,
        autoVerifyFailed: true,
        email: 'foo@bar.com'
    })
})

test('email coordinator surfaces server iq error with code in message', async () => {
    const coordinator = createEmailCoordinator({
        queryWithContext: async () => iqError(WA_EMAIL_ERROR_CODES.CODE_INCORRECT, 'bad')
    })

    await assert.rejects(coordinator.verifyCode('999999'), (err) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /email\.verifyCode/)
        assert.match(err.message, new RegExp(String(WA_EMAIL_ERROR_CODES.CODE_INCORRECT)))
        assert.match(err.message, /bad/)
        return true
    })
})

test('email coordinator requestVerificationCode and confirm pass through to queryWithContext', async () => {
    const calls: Array<{ context: string; node: BinaryNode }> = []
    const coordinator = createEmailCoordinator({
        queryWithContext: async (context, node) => {
            calls.push({ context, node })
            return iqResult()
        }
    })

    await coordinator.requestVerificationCode({ languageCode: 'pt', localeCode: 'BR' })
    await coordinator.confirm(WA_EMAIL_CONTEXTS.SETTINGS)

    assert.equal(calls[0].context, 'email.requestCode')
    assert.equal(calls[0].node.attrs.type, 'set')
    assert.equal(calls[1].context, 'email.confirm')
    assert.equal(calls[1].node.attrs.type, 'set')
})
