---
'zapo-js': patch
---

Correct the media reupload contract for re-keyed answers. The v1.8.0 notes stated that on `result: 'success'` only the `directPath` changes; that does not always hold. Some primaries re-encrypt the file on every re-upload, so the answer is `success` with a fresh path but the re-served blob no longer matches the original `fileEncSha256` and `downloadBytes()` throws a MAC mismatch. Nothing in the round-trip carries key material for the new ciphertext, so the message is unrecoverable through this API, and the docs now say so instead of promising the original key still works.
