---
'@zapo-js/fake-server': patch
---

Send `stream:error` 515 after the companion answers `pair-success`, as the real server does, so the client restarts on the server's signal.
