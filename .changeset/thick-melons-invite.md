---
'@zapo-js/mcp-server': minor
---

Add `MCP_DEVICE_OS_VERSION` to override the OS version advertised in
`DeviceProps.version`. Set it alongside `MCP_DEVICE_OS_DISPLAY` when advertising
an OS the process is not running on, so the advertised name and version agree.
