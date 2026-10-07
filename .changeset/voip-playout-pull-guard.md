---
'@zapo-js/voip': patch
---

Keep a playout pull that throws from taking the process down, and time the video hold on a monotonic clock.

The audio engine's playback timer pulled each block from the media without a
guard, so a pull that threw escaped the timer callback as an uncaught exception
and ended the process. It now costs that block alone, as a failing sink already
did. The hold on our video until the peer can receive it now measures the time
held on `performance.now()`, so a wall-clock change mid-call no longer skews the
time it logs.
