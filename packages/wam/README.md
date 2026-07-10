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

**131** of the registry's **426** events. They come from two independently toggled
sources:

| Source             | Flag          | Default | Count |
| ------------------ | ------------- | ------- | ----- |
| Protocol lifecycle | `autoEmit`    | on      | 19    |
| Integrator actions | `autoEmit`    | on      | 18    |
| Synthetic UI       | `syntheticUi` | on      | 94    |

<details>
<summary>Full list</summary>

**Protocol lifecycle (19)** - derived from real inbound/outbound stanzas:
`E2eMessageSend`, `E2eMessageRecv`, `MessageSend`, `MessageReceive`,
`WebcMessageSend`, `ReceiptStanzaReceive`, `MessageHighRetryCount`,
`EditMessageSend`, `ClockSkewDifferenceT`, `GroupJoinC`, `WaOldCode`,
`WebcSocketConnect`, `WebcStreamModeChange`, `WebcPageResume`,
`WebcRawPlatforms`, `MdBootstrapHistoryDataReceived`, `UnknownStanza`,
`OfflineCountTooHigh`, `WebWamForceFlush`

**Integrator actions (18)** - the client's own sends and app-state mutations:
`ForwardSend`, `ReactionActions`, `PollsActions`, `SendDocument`, `StickerSend`,
`PinInChatMessageSend`, `RevokeMessageSend`, `SendRevokeMessage`,
`MessageDeleteActions`, `WaFsGroupJoinRequestAction`, `GroupCreate`,
`GroupCreateC`, `EphemeralSettingChange`, `DisappearingModeSettingChange`,
`ChatMute`, `ChatAction`, `StatusMute`, `MdSyncdDogfoodingFeatureUsage`

**Synthetic UI (94)** - plausible activity, every event grounded in WA Web's own
emit (only the field subset WA sets, with plausible values). The base stream —
`UiAction` (chat/image/info opens), `WebcChatOpen`, `AttachmentTrayActions`,
`ContactSearchExperience`, `MemoryStat`, `UserActivity`/`TsBitArray`,
`WebcEmojiOpen`, `StickerPickerOpened`, `AboutConsumption`/`AboutInteraction`,
`WebcMediaLoad` — plus a weighted ambient table of ~70 more UI events and 9
message-anchored ones (media playback/compose, mention picker, group catch-up, …).
The table lives in
[`src/synthetic/fabrications.ts`](src/synthetic/fabrications.ts).

**9 events are capability-gated** (default **off**) — firing them on an account that
lacks the surface is itself a tell: `ChannelOpen` needs `channels`; the `Community*`
events and `GroupJourney` need `communities`; the business/SMB events
(`WaShopsManagement`, `MdChatAssignmentSecondaryAction`,
`StructuredMessageBuyerInteraction`) need `business`.

</details>

## Coverage

**131 / 426** registry events (~31%). The rest are dominated by data a headless
client cannot produce or plausibly fake — browser/runtime internals, device and OS
state, mobile-app-only flows, crypto internals, ads, server-side aggregates — plus
events carried on the private (non-`w:stats`) channels.

Two disciplines keep the emitted set a faithful fingerprint:

- **Auto-emitted** protocol and integrator events are sent only when **every field
  is honestly derivable** from real client activity.
- **Synthetic UI** events are **fabricated**, but each replicates WA Web's actual
  emit — only the field subset WA sets, with plausible values — verified against the
  deobfuscated web bundle. They are jittered, rate-limited, and confined to
  configurable active hours; a badly-timed or skeleton event is a worse tell than
  none, so events WA Web itself never fires are left out.

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

`syntheticUi` also accepts an options object. Besides jitter/interval and
`activeHoursStartHour`/`activeHoursEndHour` tuning, `channels`, `communities`, and
`business` (all default `false`) enable the capability-gated ambient events for
accounts that actually have those surfaces.

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
WAM event WA Web fires at the same point. `syntheticUi` fabricates UI telemetry — a
weighted table of wa-web-grounded ambient events plus message-anchored ones —
jittered and confined to configurable active hours.
