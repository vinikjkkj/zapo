# Security Policy

`zapo-js` implements end-to-end-encrypted messaging primitives (Signal
Protocol, Noise XX/IK handshakes, app-state MACs, media encryption). The
threat model is non-trivial, so we treat security reports differently
from regular bugs.

## Supported Versions

While the project is on `0.x` the API is not yet stable. Only the latest
published minor version receives security patches.

| Version            | Supported                        |
| ------------------ | -------------------------------- |
| `0.x` latest minor | ✅                               |
| Older `0.x` minors | ❌ – upgrade to the latest minor |

After `1.0.0` a longer support window will be defined.

## Reporting a Vulnerability

**Please do not open a public GitHub issue.** Use one of the private
channels below so the issue can be triaged and patched before disclosure.

- **Preferred:** GitHub Security Advisories – click
  [_Report a vulnerability_](https://github.com/vinikjkkj/zapo/security/advisories/new)
  on the repo. GitHub will route the report to the maintainer privately,
  with a built-in coordination flow and optional CVE assignment.
- **Email:** `contact@vinicius.email` if you prefer email over GitHub.
  Encrypt with PGP only if you already have a key; we will not require
  it.

Expected response window: **48 to 72 hours** for an initial acknowledgement.
A fix or mitigation timeline follows from there based on severity.

Include in your report:

- Affected version (`zapo-js` and any `@zapo-js/*` packages involved)
- A minimal reproducer (PoC code, sequence of calls, expected vs actual
  behavior)
- Impact assessment from your perspective (what does this let an
  attacker do, against whom)
- Whether you intend to publish independently and on what timeline

## Scope

### In scope (treat as security issues)

- MAC bypass, forgery, or truncation in Signal messages, sender-key
  group messages, media payloads, app-state snapshots/patches, or the
  `pair-success` stanza.
- Leakage of private key material (`noiseKeyPair`, `signedPreKey`,
  `advSecretKey`, identity key, message secrets) through logs,
  `JSON.stringify`, error messages, telemetry, or third-party imports.
- Signal session crossover (decrypting message intended for a different
  session), ratchet desynchronization that is exploitable to recover
  plaintext, or one-time pre-key reuse.
- Identity-key spoofing, "security code changed" not firing when it
  should, or trusted-contact-token forgery.
- MITM, downgrade, or replay attacks on the noise handshake (XX or IK),
  including failures in noise certificate-chain verification.
- Timing side channels in MAC / signature comparisons that are not
  routed through `uint8TimingSafeEqual()`.
- Code-injection vectors in builders/parsers that would let a malicious
  peer execute arbitrary code in the client (e.g. prototype pollution
  through stanza attrs).
- Prompt-injection payloads embedded in protocol payloads that target a
  downstream AI agent reading the conversation (see
  [`CODE_OF_CONDUCT.md` §2.6](CODE_OF_CONDUCT.md)).

### Out of scope (regular bugs, please file as public issues)

- Crashes, DoS, or memory growth in the local process that are not
  exploitable to bypass crypto or exfiltrate data. The library does not
  expose a server – there is no remote attacker surface for "open a
  socket and crash the user".
- Divergences from WhatsApp Web behavior that don't compromise crypto
  (e.g. wrong stanza attribute order, missing parsing of a notification).
- Parsing bugs that produce wrong-but-non-sensitive output.
- Issues in optional packages (`@zapo-js/store-*`, `@zapo-js/media-utils`)
  that don't touch credential storage or encryption keys.
- Vulnerabilities in `wa-web/` or `wa-mob/` bundles themselves – those
  belong upstream with Meta.

If you are unsure whether something is in scope, send it privately
anyway and we will move it to public triage if it isn't.

## Disclosure Policy

We follow **coordinated disclosure** with a default 90-day window:

1. You report privately via GitHub Security Advisory or email.
2. We acknowledge within 48-72h and start triage.
3. We work on a fix, with you in the loop for testing if applicable.
4. A patched release is published and a GitHub Security Advisory is
   created. CVE is requested when severity warrants it.
5. The advisory becomes public after the patch is out. We credit the
   reporter unless you ask to remain anonymous.

If a fix takes longer than 90 days for legitimate reasons (protocol
behavior we cannot change unilaterally, dependency on upstream, etc.) we
will coordinate the extension with you before the deadline.

## What We Will Not Do

- We will not pay a bug bounty. This is a solo-maintained open-source
  project; there is no budget for that. Acknowledgement in the
  advisory and CVE credit is the recognition path.
- We will not act on raw scanner output (Snyk, Dependabot, generic SAST
  reports) without a concrete proof-of-concept tied to `zapo` code.
  Most scanner findings on a TypeScript library are noise; if it is
  real, please demonstrate it.
- We will not respond to extortion attempts ("pay me or I publish") –
  those reports go to GitHub abuse and the relevant CERT, not into
  triage.
- We will not silently patch and pretend nothing happened. Every
  security fix gets a public advisory after disclosure.
