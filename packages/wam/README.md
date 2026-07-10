# @zapo-js/wam

WhatsApp Web **WAM** (analytics/telemetry) plugin for [zapo-js](../../). It emits
the client-side `w:stats` metrics batches WA Web sends, for **wire parity** and
**anti-fingerprinting**.

WA Web continuously uploads WAM (Falco) telemetry: message send/receive metrics,
connection lifecycle, sync progress, UI interactions, and more. A headless client
that uploads **none** of these has a conspicuous gap in its event profile. This
plugin closes that gap by emitting the events a headless client can _truthfully_
produce, and by fabricating plausible ambient UI activity (on by default).

## Install

```sh
npm install @zapo-js/wam
```

`zapo-js` is a peer dependency. The WAM event registry
([`@vinikjkkj/wa-wam`](https://www.npmjs.com/package/@vinikjkkj/wa-wam)) is
bundled.

## Usage

```ts
import { WaClient } from 'zapo-js'
import { wamPlugin } from '@zapo-js/wam'

const client = new WaClient({
    store,
    sessionId: 'main',
    plugins: [wamPlugin()]
})

// Protocol events auto-emit as the client runs. You can also commit your own:
client.wam.commit('UiAction', { uiActionType: 'CHAT_OPEN' })
```

Synthetic UI telemetry is on by default. Disable it (or tune it) with:

```ts
plugins: [wamPlugin({ syntheticUi: false })]
```

## Events emitted

**39** of the registry's **426** events. They come from two independently toggled
sources:

| Source             | Flag          | Default | Count |
| ------------------ | ------------- | ------- | ----- |
| Protocol lifecycle | `autoEmit`    | on      | 17    |
| Integrator actions | `autoEmit`    | on      | 13    |
| Synthetic UI       | `syntheticUi` | on      | 9     |

<details>
<summary>Full list</summary>

**Protocol lifecycle (17)** - derived from real inbound/outbound stanzas:
`E2eMessageSend`, `E2eMessageRecv`, `MessageSend`, `MessageReceive`,
`WebcMessageSend`, `ReceiptStanzaReceive`, `MessageHighRetryCount`,
`EditMessageSend`, `ClockSkewDifferenceT`, `GroupJoinC`, `WaOldCode`,
`WebcSocketConnect`, `WebcStreamModeChange`, `WebcPageResume`,
`WebcRawPlatforms`, `MdBootstrapHistoryDataReceived`, `UnknownStanza`

**Integrator actions (13)** - the client's own sends and app-state mutations:
`ForwardSend`, `ReactionActions`, `PollsActions`, `SendDocument`, `StickerSend`,
`PinInChatMessageSend`, `RevokeMessageSend`, `MessageDeleteActions`,
`WaFsGroupJoinRequestAction`, `ChatMute`, `ChatAction`, `StatusMute`,
`MdSyncdDogfoodingFeatureUsage`

**Synthetic UI (9)** - fabricated plausible ambient activity:
`UiAction`, `AboutConsumption`, `AttachmentTrayActions`,
`ContactSearchExperience`, `MemoryStat`, `UserActivity`, `WebcChatOpen`,
`WebcEmojiOpen`, `WebcMediaLoad`

</details>

## Coverage

**35 / 426** registry events (~8%). The low figure is **by design**: the
remaining ~390 events are dominated by data a headless client does not have and
cannot truthfully synthesize (browser/runtime internals, device and OS state,
mobile-app-only flows, UI-render interactions, crypto internals, ads, and
server-side aggregates).

The plugin only emits an event when **every field it sets is honestly derivable**.
A partial or fabricated ("skeleton") event is a _worse_ fingerprint than silence,
so those are deliberately left unimplemented rather than filled with placeholders.

## Options

`wamPlugin(options)`, all optional:

| Option                     | Default       | Description                                                              |
| -------------------------- | ------------- | ------------------------------------------------------------------------ |
| `autoEmit`                 | `true`        | Emit protocol + integrator-action events by observing the client         |
| `syntheticUi`              | `true`        | Fabricate plausible UI telemetry (`false` to disable, or options object) |
| `serviceImprovementOptOut` | `false`       | `service_improvement_opt_out` consent bit                                |
| `appVersion`               | `WA_VERSION`  | Override the advertised app version                                      |
| `flushIntervalMs`          | `5000`        | Coalesce window before a non-empty batch flushes                         |
| `maxBufferSize`            | `50000`       | Byte size that forces an immediate flush                                 |
| `logLevel`                 | host client's | Minimum log level for the plugin                                         |

## How it works

1. **Accumulate**: committed events buffer into a per-channel batch whose globals
   derive from the client's own device identity, so they agree with the pairing
   `ClientPayload`.
2. **Flush**: on the coalesce interval, on reaching `maxBufferSize`, or on
   dispose.
3. **Upload**: as the `<iq type="set" xmlns="w:stats"><add t>` stanza WA Web
   sends. Best-effort; transient failures retry with backoff, and a permanently
   failing batch is dropped, never surfaced.

`autoEmit` observes the client's typed events and raw stanzas and maps each to the
WAM event WA Web fires at the same point. `syntheticUi` fabricates ambient
`UiAction`/activity telemetry within configurable active hours.
