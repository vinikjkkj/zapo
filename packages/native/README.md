# @zapo-js/native

Optional native accelerators for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Moves the crypto hot path off pure JavaScript and onto a compiled backend, with transparent fallback so the client works everywhere regardless of what's installed.

## How it works

The same Rust core is shipped two ways, selected at load time. Callers never
change — the client resolves the fastest available backend and degrades
gracefully:

| Backend  | What it is                               | Requires                            |
| -------- | ---------------------------------------- | ----------------------------------- |
| **napi** | Compiled Rust addon (fastest)            | A prebuilt binary for your platform |
| **wasm** | WebAssembly build of the same Rust core  | Nothing — ships inside this package |
| **js**   | Pure-JS / `node:crypto` (no accelerator) | Nothing — built into `zapo-js`      |

If the native addon can't load, the WASM fallback is used; if that's disabled,
the pure-JS path in `zapo-js` takes over. Installing this package is always
safe: a missing or unsupported binary never breaks the client.

## Install

```bash
npm install @zapo-js/native
```

The platform-specific addon is delivered as an optional dependency, so `npm`
downloads only the binary for your OS/arch (if one exists). The WASM fallback
is bundled in the main package and needs no binary at all.

## Backend selection

The backend is chosen automatically. To pin it explicitly, set
`ZAPO_NATIVE_BACKEND` before the process starts:

```bash
ZAPO_NATIVE_BACKEND=napi   # force the native addon (default when available)
ZAPO_NATIVE_BACKEND=wasm   # force the WebAssembly build
ZAPO_NATIVE_BACKEND=js     # disable the accelerator, use the pure-JS path
```

An unavailable choice falls through to the next available backend rather than
erroring.

## Notes

- **Optional by design.** The accelerator is a performance layer, not a
  correctness dependency — outputs are byte-identical across all three
  backends (verified by the cross-check tests).
- **ABI-stable binaries.** The native addon is built with N-API, so one binary
  per platform works across every supported Node version — no rebuild on Node
  upgrades.
- **WASM runs anywhere.** The bundled WebAssembly fallback runs on any platform
  the native addon doesn't cover.

See the main [`zapo-js`](../../README.md) docs for the client contract.
