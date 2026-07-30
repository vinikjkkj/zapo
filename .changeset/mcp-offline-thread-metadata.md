---
'@zapo-js/mcp-server': patch
---

Buffer the core `offline_thread_metadata` event so the `events` tool can query
it. The subscription list is explicit, so a new core event is invisible to the
MCP until it is registered there.
