---
'@zapo-js/store-postgres': minor
'@zapo-js/store-sqlite': minor
'@zapo-js/store-mysql': minor
'@zapo-js/store-mongo': minor
'@zapo-js/store-redis': minor
---

Persist the contact's username handle. `WaStoredContactRecord` gained an
optional `username` field, and every backend now reads and writes it: SQL
providers add a `username` column through a new migration (`0020` on sqlite,
`0021` on postgres and mysql), redis adds a hash field, and mongo adds a
document field. The handle feeds the username-addressed blocklist and
privacy-list identifiers.
