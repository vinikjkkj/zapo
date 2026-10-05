---
'@zapo-js/voip': patch
---

Stamp call audio and video on one media clock, and keep the audio clocks at real time.

WhatsApp Web paces the video it plays against the audio by subtracting the two
RTP timestamps, and it holds that difference in microseconds in a signed 32-bit
integer. Our audio counted from a random point of the 32-bit space and our video
from near zero, so the difference overflowed it, and in about half the calls the
receiver read the video as ahead of the audio and held it for good: the picture
froze, with no log and no key-frame request. Both streams are now stamped on one
clock per call, started near zero and anchored on the instant the media was
captured.

The audio engine's capture and playout clocks moved one chunk per `setInterval`
tick, and timers fire late and coarse, so both ran at 70-90% of real time: less
audio left than the call lasted, and inbound audio piled up in the jitter buffer
until it dropped seconds of it. Each clock now moves every chunk the elapsed time
owes, up to four per tick, and a longer stall is forgiven rather than replayed.
