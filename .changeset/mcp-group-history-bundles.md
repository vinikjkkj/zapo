---
'@zapo-js/mcp-server': minor
---

Add `MCP_GROUP_BUNDLES` to opt into downloading the group-history bundles other
members share, and buffer the resulting `group_history_bundle` events so the
`events` tool can query them.
