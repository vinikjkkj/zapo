# Meta Business Agent (experimental)

`client.businessAgent` manages the native Meta Business Agent already available
on an eligible WhatsApp Business account connected by QR. It uses the session's
native SMB authentication and Facebook HTTP Relay operations. No Cloud API
token, WABA ID or Phone Number ID is required. Meta controls eligibility and
rollout; these methods do not create an agent or unlock unavailable features.

## Read account state

Use an authenticated Business client, after your normal QR pairing flow:

```ts
const eligible = await client.businessAgent.getEligibility()
const available = await client.businessAgent.getAvailability()
const abilities = await client.businessAgent.getStatus()
const gate = await client.businessAgent.getResponseSettingsAvailability()
const settings = await client.businessAgent.getResponseSettings()
```

`null` means the native value was absent. `false` remains false. Settings reads
preserve future status and audience enum strings. The settings fetch and V2 gate
are persisted GraphQL mutations with read-only effect.

## Pause, resume and audience

```ts
const paused = await client.businessAgent.updateResponseSettings({ status: 'MUTED' })
const resumed = await client.businessAgent.updateResponseSettings({ status: 'ENABLED' })

// This replaces the complete audience rule array. Fetch current settings first.
const audience = await client.businessAgent.updateResponseSettings({
    audienceRules: [
        { selectorType: 'CONTACTS', mode: 'MUTED' },
        { selectorType: 'ADS', mode: 'SUGGESTED_REPLIES' },
        { selectorType: 'ALL', mode: 'UNMUTED' }
    ]
})
```

Supported selectors are `CONTACTS`, `ADS` and `ALL`; modes are `MUTED`,
`SUGGESTED_REPLIES` and `UNMUTED`. Global `ENABLED` does not guarantee replies:
audience rules and per-conversation overrides also apply. There is no delete
method: the inspected Web UI directs account deletion to the mobile application.

## Conversation replies and reengagement

```ts
const muted = await client.businessAgent.setConversationReplies({
    consumerLid: verifiedConsumerLid,
    status: 'MUTED'
})
const enabled = await client.businessAgent.setConversationReplies({
    phoneNumber: verifiedPhoneDigits,
    status: 'ENABLED'
})
const followUp = await client.businessAgent.updateReengagement({ enabled: false })
```

Use bare decimal identifiers recovered from authenticated conversation metadata.
At least one identifier is required; a supplied phone/LID pair must describe the
same customer. The library never guesses phone-to-LID mappings. Reengagement
accepts an optional integer `amount`; the server enforces account-specific limits.
Customer identifiers are sensitive: do not log these inputs and encrypt them at rest.

## Outcomes and errors

Writes return `{ outcome: 'accepted' | 'rejected' | 'unknown' }`. A native boolean
`success` confirms the settings/conversation writes. Reengagement is accepted
only when the applied `enabled` and any requested `amount` match the response.
An HTTP 200 without confirmation remains unknown.

Network failures, partial GraphQL responses, malformed JSON, redirects and server
failures throw `WaBusinessAgentError` with an `unconfirmed` code. Reconcile settings
before issuing another write. No operation is automatically replayed. Error
messages exclude remote text and response bodies; `serverCode` contains only a
sanitized numeric code. A refusal uses `rejected`, including expired token code
190, which also invalidates the cached authentication without repeating the write.

Native authentication runs once per connection with concurrent requests coalesced:
IQ 118, server `wa_ad_account_nonce`, IQ 104. Tokens, cookies and nonce values are
RAM-only and hidden from transport debug nodes/frames, public stanza filters and
trace XML. Socket closure, manual disconnect and account changes invalidate the
authentication and cancel pending HTTP. A nonce timeout cannot trigger a later
exchange. Native lockouts 429/431 retain a 10-minute cooldown across reconnects;
a repeated lockout uses 24 hours. `recovery_required` requires action in the
official application. No authentication or mutation retry happens automatically.

HTTP uses the fixed `https://graph.facebook.com/graphql` endpoint, a 30-second
deadline including body reads, a 2 MiB request/response limit and no redirects.
For HTTP proxy egress, set `proxy.businessAgent` to an undici-style dispatcher.
This is independent of `proxy.ws`; an `http.Agent` is rejected for this field.
Do not configure an untrusted dispatcher: it handles authenticated HTTP requests.

## Protocol evidence and validation

Contracts were checked against locally indexed native Web modules:
`WASmaxBizAccessTokenRequestSilentNonceRPC`, `WAWebFetchAdAccountToken`,
`WAWebCTWABizAccessTokenNonceManager`, `WAWebRelayEnvironment`, and the operations below.
The response settings V2 caller reference is Meta resource
`https://static.whatsapp.net/rsrc.php/v4iC6b4/yF/l/en_US-j/dlmcmg1qjGG.js`.
Third-party bundles and production captures are not included in this contribution.

| Public method                     | Native operation                                | Document ID         |
| --------------------------------- | ----------------------------------------------- | ------------------- |
| `getStatus`                       | `WAWebBizAIAbilityStatusQuery`                  | `27855405457379489` |
| `getEligibility`                  | `WAWebBizAiToolsTileEligibilityQuery`           | `27140128522251730` |
| `getAvailability`                 | `WAWebFetchBizAiLargeScreensGateQuery`          | `27287965697525752` |
| `getResponseSettings`             | `WAWebBizAiResponseSettingsV2FetchMutation`     | `28169016829397830` |
| `getResponseSettingsAvailability` | `WAWebFetchBizAiResponseSettingsV2GateMutation` | `38891021877207639` |
| `updateResponseSettings`          | `WAWebBizAiResponseSettingsV2UpdateMutation`    | `27987559807539263` |
| `setConversationReplies`          | `WAWebAiAgentAutoReplyControlMutation`          | `27338647792432014` |
| `updateReengagement`              | `WAWebBizAiReengagementUpdateMutation`          | `27136574649299744` |

The IDs stay decimal strings in JSON, matching native Relay and avoiding
JavaScript integer precision loss. These private persisted contracts can change.

Core tests exercise validation, nonce spoofing/replay/expiry, cancellation,
cooldowns, outcome handling and debug privacy. The fake-server cross-check drives
the real client through Noise, QR pairing, native SMB stanzas, loopback HTTP and
reconnection. Run it with:

```sh
node --import tsx --test packages/fake-server/src/__tests__/business-agent.cross-check.test.ts
```

An independent PHP implementation provided real-account evidence for the native
flow and a reply generated in an explicitly enabled test conversation. That is
reference evidence, not live validation of this TypeScript implementation. Live
TypeScript validation on a dedicated eligible Business account remains pending.
