# @zapo-js/wam

## 0.1.1

### Patch Changes

- Gate WAM telemetry uploads on account registration: batches are dropped until the client has registered credentials (`meJid`), so no analytics is uploaded before login even when the socket is already connected.
