# @zapo-js/media-utils

`WaMediaProcessor` implementation for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Hooks `sharp` and `ffmpeg`/`ffprobe` into the client so outgoing media gets the right thumbnails, waveforms, and voice-note normalization without you wiring any of that yourself.

## What it does

| Capability                             | Backend   | Used by                                                      |
| -------------------------------------- | --------- | ------------------------------------------------------------ |
| Image thumbnails                       | `sharp`   | `image` / `document` previews                                |
| Sticker thumbnails                     | `sharp`   | sticker previews + animated sticker first-frame              |
| Video thumbnails                       | `ffmpeg`  | `video` / `ptv` first-frame previews                         |
| Media probe (duration, mime, w/h)      | `ffprobe` | every media kind that needs dimensions                       |
| Voice-note waveform                    | `ffmpeg`  | `audio` `ptt` waveform bar                                   |
| Voice-note normalization (Opus encode) | `ffmpeg`  | recording-pipeline outputs that aren't already Opus 16k mono |

## Install

```bash
npm install @zapo-js/media-utils sharp
```

`sharp` is a peer dependency. `ffmpeg` and `ffprobe` are external binaries the
package shells out to - install them once on the system (or vendor a static
build into the deploy).

### Installing ffmpeg + ffprobe

Most distributions ship `ffprobe` together with `ffmpeg` (same upstream).

**macOS (Homebrew):**

```bash
brew install ffmpeg
ffmpeg -version && ffprobe -version
```

**Debian / Ubuntu:**

```bash
sudo apt update && sudo apt install -y ffmpeg
```

**Fedora / RHEL (RPM Fusion):**

```bash
sudo dnf install -y https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf install -y ffmpeg
```

**Alpine (Docker base images):**

```bash
apk add --no-cache ffmpeg
```

**Windows (Chocolatey / winget / Scoop):**

```powershell
choco install ffmpeg-full -y          # OR
winget install Gyan.FFmpeg            # OR
scoop install ffmpeg
```

**Vendored static build (any OS, no system package manager):**

```bash
# pulls a self-contained ffmpeg + ffprobe pair into ./node_modules/.bin
npm install --save-dev @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
```

```ts
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg'
import { path as ffprobePath } from '@ffprobe-installer/ffprobe'
import { createMediaProcessor } from '@zapo-js/media-utils'

const processor = createMediaProcessor({ ffmpegPath, ffprobePath })
```

**Dockerfile snippet** (Alpine base, no system PM allowed at runtime):

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache ffmpeg
```

Confirm `ffmpeg -version` and `ffprobe -version` resolve before starting your
app. The processor is non-fatal on missing binaries (emits a `warn` through
the per-call logger context instead of throwing), so a misconfigured deploy
degrades to "no thumbnails / no waveform" instead of crashing.

## Quick start

```ts
import { WaClient } from 'zapo-js'
import { createMediaProcessor } from '@zapo-js/media-utils'

// One processor can be shared across many WaClient sessions. The runtime
// passes a per-call `ctx.logger` to each method so warnings always land
// in the right session log without any per-session setup.
const processor = createMediaProcessor()

const client = new WaClient({
    store,
    sessionId: 'default',
    media: { processor }
})

// Now sending a video produces a real thumbnail + correct duration/dimensions:
await client.message.send(jid, {
    type: 'video',
    media: '/tmp/clip.mp4',
    mimetype: 'video/mp4',
    caption: 'demo'
})
```

## Config

`createMediaProcessor(options)` accepts:

| Field                                                               | Description                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ffmpegPath` / `ffprobePath`                                        | Override binary paths (default: resolved from `PATH`).      |
| `imageThumbMaxEdge`                                                 | Override the per-call `maxEdge` for image/video thumbnails. |
| `imageThumbQuality`                                                 | JPEG quality (1-100) for image thumbnails.                  |
| `waveformPoints`                                                    | Number of waveform points for voice notes (WA default: 64). |
| `voiceNoteBitRate` / `voiceNoteSampleRate` / `voiceNoteApplication` | Opus encoding params for voice-note normalization.          |

Logging is wired automatically when the processor is invoked from a
`WaClient`: every method receives a per-call `ctx: { logger?: Logger }`
the runtime fills in with that session's logger (carrying its
`{ session, scope: 'media-utils' }` bindings). No callback to plumb, no
mutable state on the processor - so a single `createMediaProcessor()`
result is safe to share across multiple `WaClient` instances. When used
standalone (no `ctx`), the processor stays silent.

## Notes

- **Missing binaries are non-fatal.** If `ffmpeg`/`ffprobe` isn't installed, the affected operation is skipped and a `warn` is emitted through the per-call logger context - the rest of the media path still works. This means you can ship the processor as a soft dependency.
- The thumbnail / waveform code paths follow what the official client produces - sticker first-frame extraction matches WhatsApp's expected layout, waveforms render natively on iOS/Android/desktop.
- Voice-note normalization is needed because WhatsApp only renders Opus 16k mono in the chat UI - other formats play but lose the waveform.

See the main [`zapo-js`](../../README.md) docs for the `media` option and `WaMediaProcessor` contract.
