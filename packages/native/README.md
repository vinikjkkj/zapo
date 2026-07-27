# @zapo-js/native

Optional native accelerators for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Moves the crypto hot path off pure JavaScript and onto a compiled backend, with transparent fallback so the client works everywhere regardless of what's installed.

## How it works

The same Rust core is shipped two ways, selected at load time. Callers never
change – the client resolves the fastest available backend and degrades
gracefully:

| Backend  | What it is                               | Requires                              |
| -------- | ---------------------------------------- | ------------------------------------- |
| **napi** | Compiled Rust addon (fastest)            | Building from source (Rust toolchain) |
| **wasm** | WebAssembly build of the same Rust core  | Nothing – ships inside this package   |
| **js**   | Pure-JS / `node:crypto` (no accelerator) | Nothing – built into `zapo-js`        |

If the native addon can't load, the WASM fallback is used; if that's disabled,
the pure-JS path in `zapo-js` takes over. Installing this package is always
safe: a missing or unsupported binary never breaks the client.

## Install

```bash
npm install @zapo-js/native
```

The published package currently ships the WASM backend only – it works on any
OS/arch with no toolchain. Prebuilt NAPI binaries are not on npm yet; to use
the (faster) native addon, build it from source inside a repo checkout with a
Rust toolchain installed:

```bash
npm run build:napi -w packages/native
```

## Backend selection

The default (`auto`) tries the NAPI addon first, then the WASM build, then
the pure-JS path. To pin a single backend, set `ZAPO_NATIVE_BACKEND` before
the process starts:

```bash
ZAPO_NATIVE_BACKEND=napi   # only the native addon
ZAPO_NATIVE_BACKEND=wasm   # only the WebAssembly build
ZAPO_NATIVE_BACKEND=js     # disable the accelerator, use the pure-JS path
```

A pinned backend that is unavailable does not error – the client silently
falls back to the pure-JS path.

## One WASM artifact, Node and browser

The WASM backend is a single `--target web` build under `wasm/pkg/` – the
same artifact serves both environments:

- **Node**: `zapo-js` loads it automatically (the glue is ESM, loaded via
  `require(esm)` and initialised synchronously with the bundled `.wasm`
  bytes). This needs Node 20.19+ / 22.12+; on older runtimes the client
  silently falls back to the pure-JS path.
- **Browser / bundler**: import it directly and initialise before use:

```js
import init, {
    x25519ScalarMult,
    xeddsaSign,
    xeddsaVerify
} from '@zapo-js/native/wasm/pkg/zapo_native_wasm.js'

await init()
const shared = x25519ScalarMult(privateKey, publicKey)
```

## Notes

- **Optional by design.** The accelerator is a performance layer, not a
  correctness dependency – outputs are byte-identical across all three
  backends (verified by the cross-check tests).
- **ABI-stable binaries.** The native addon is built with N-API, so one binary
  per platform works across every supported Node version – no rebuild on Node
  upgrades.
- **WASM runs anywhere.** The bundled WebAssembly fallback runs on any platform
  the native addon doesn't cover.
- **The root import is the NAPI addon.** `require('@zapo-js/native')` resolves
  to the compiled addon, so on the published wasm-only package it throws a
  module-not-found error – that failure is exactly what makes `zapo-js` fall
  through to the WASM build. To use the primitives directly, import the
  `wasm/pkg` subpath shown above.

See the main [`zapo-js`](../../README.md) docs for the client contract.
