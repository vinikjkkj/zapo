---
'@zapo-js/store-sqlite': minor
'@zapo-js/store-postgres': minor
'@zapo-js/store-mysql': minor
'@zapo-js/store-redis': minor
'@zapo-js/store-mongo': minor
---

Persist post-quantum (ML-KEM-1024) pre-keys: a Kyber pre-key table plus a next-id counter and a migrated flag next to the classic prekey state. The SQL stores add a migration for it. The new pre-key methods are optional in the `zapo-js` contract, so an older `zapo-js` simply never calls them and a newer one stays on classic Signal with a store that lacks them.
