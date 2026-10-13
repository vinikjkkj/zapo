---
'@zapo-js/voip': minor
---

Place, answer, follow and leave group calls.

`startCall({ groupJid, participants })` places a group call, addressed to the call itself, and `leaveCall(callId)` steps out of one. On a group call `endCall` does the same, as no member can end one for everybody: both send one terminate to the call itself, with its duration once it connected, and the call ends when its last member leaves. A group call we place connects when the server's roster lists another participant connected. An incoming group call carries `call.groupJid`, `call.joinable` and `call.groupComposition`, and every change of who is on it arrives on `voip_call_participants_changed`. A participant's terminate takes only that participant off an established group call; a terminate on a call we are still joining, and one for a group call not yet offered, keeps the call, and the terminates that arrive for a call after it ended here are dropped.

The call key arrives over `enc_rekey`, answered with a receipt and held when it beats its offer; when the server makes this side the rekey master, it mints the key and sends it to every connected device. The media plan carries one key per remote device, declares our streams by layer, and follows the relay the server moves the call to, or re-credits: over raw UDP when it carries no ICE credential, the ordinary way when it does. A remote media host that cannot carry a group call is reported on `voip_call_error`.

An offer the server refuses with an error ack no longer leaves the call ringing, on 1:1 calls too: it ends with the new `EndCallReason.SetupFailed`, and the peer, or the call itself on a group call, is sent a `setup_failed` terminate.
