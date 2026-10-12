---
'@zapo-js/voip-media': minor
---

Add `setPlayoutMuted`, `setMicrophone` and `setOutput` to `WaWebCallAudio`, and an `output` option to `start`.

`setPlayoutMuted` silences the speaker through a gain node with a short ramp and keeps pulling playout, so a call comes back from hold in step. `setMicrophone` swaps only the source node, keeping the worklet and the context; a stream the context refuses throws and leaves the current microphone running. `output` picks the output device through the `sinkId` option of the `AudioContext` constructor, or `setSinkId` where the constructor ignores it, and `setOutput` through `setSinkId` (Chrome, Edge), on the context the adapter creates, which it still resumes and still falls back to the device rate with; where the browser has no `setSinkId` they fail with a `NotSupportedError`, except for the default device, `''`, which the context already plays to. A context passed in keeps its own output.
