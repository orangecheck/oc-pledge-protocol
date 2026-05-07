# OC Pledge — eat-your-own-dogfood runbook

**Audience:** anyone publishing OC-team pledges — both the original v1.0 cut sequence (since fired) and any subsequent OC-led commitments that should land alongside the case-studies table in `PROTOCOL.md`.

**Goal:** exercise the deterministic-mechanism / counterparty-signs / dispute paths end-to-end with real OC-team Bitcoin addresses bonded against real OrangeCheck attestations. Without live envelopes the public-ledger guarantee is theoretical; the runbook is how we keep that guarantee load-bearing as the family evolves.

The original three case studies (research preregistration, bilateral SLA, OSS delivery) fired before the v1.0 spec cut. This document is preserved as the canonical procedure for future OC pledges.

## Prerequisites

- An OC-team Bitcoin address with a **bonded OrangeCheck attestation** of at least 1M sats × 90 days unspent. Smaller bonds are fine for the SLA / OSS-delivery shapes; the research-preregistration shape's reference template uses 1M × 90.
  - Check / create at <https://attest.ochk.io/create>.
  - Note the resulting `attestation_id` (64-hex SHA-256 of the OrangeCheck canonical message).
- A wallet that supports BIP-322 message signing for the bonded address (UniSat, Xverse, Leather, OKX, Sparrow, etc).
- Network access to `wss://relay.nostr.band`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://offchain.pub` (the default relay set the composer publishes to).

The composer at <https://pledge.ochk.io/create> handles every step below — signing happens in your wallet, publishing happens to Nostr from your browser, and the resulting `/p/<id>` URL is sharable.

## The three pledges

Each shape exercises a different resolution mechanism, in priority order. Fire all three so the case-study writeup in `PROTOCOL.md` covers the deterministic / counterparty / dispute spread.

### 1 — Research preregistration (`stamp_published` deterministic)

The oldest, cleanest pledge shape. Pre-commit to the SHA-256 of a future artifact (preprint draft, internal RFC, design memo). At the deadline, publish an OC Stamp of the matching content; the pledge resolves to `kept` deterministically — no counterparty signature, no dispute path, no service availability assumption.

**Template inputs for the composer:**

| Composer field | Value |
|---|---|
| `swearer` | _your OC-team Bitcoin address_ |
| `proposition` | `I will publish <artifact name> with content_hash sha256:<your draft's hash> before <YYYY-MM-DD>.` |
| `resolution.mechanism` | `stamp_published` |
| `resolution.query` | `stamp(content_hash=sha256:<your draft's hash>, signer=<your address>)` |
| `resolves_at` | `time: <YYYY-MM-DD>T00:00:00Z` (the deadline) |
| `expires_at` | `time: <deadline + 7 days>T00:00:00Z` (a one-week dispute window) |
| `bond.attestation_id` | _your OrangeCheck attestation id_ |
| `bond.min_sats` | `1000000` (or higher) |
| `bond.min_days` | `90` |
| `counterparty` | _(blank)_ |
| `dispute.mechanism` | `null` |

Reference shape pinned in [`examples/research-preregistration.json`](./examples/research-preregistration.json).

To resolve at the deadline: stamp the actual draft via <https://stamp.ochk.io/create>, signer = same address. The pledge automatically classifies as `kept` once the stamp is on Nostr.

### 2 — Bilateral SLA (`counterparty_signs` + `vote_resolves` dispute)

Two OC contributors agree on a deliverable; one signs the pledge, the counterparty signs the outcome. A pre-named OC Vote poll handles disputed cases.

**Template inputs:**

| Composer field | Value |
|---|---|
| `swearer` | _OC-team-A address_ |
| `proposition` | `I will deliver <thing> to <OC-team-B address> by <YYYY-MM-DD>.` |
| `resolution.mechanism` | `counterparty_signs` |
| `resolution.query` | `counterparty(<OC-team-B address>) signs outcome over pledge_id` |
| `resolves_at` | `time: <delivery deadline>T00:00:00Z` |
| `expires_at` | `time: <deadline + 14 days>T00:00:00Z` |
| `bond` | _(your attestation; min_sats / min_days appropriate to the value)_ |
| `counterparty` | _OC-team-B address_ |
| `dispute.mechanism` | `vote_resolves` |
| `dispute.params` | `poll_id=<pre-named OC Vote poll id>;option=kept;threshold=0.5` |

Reference shape pinned in [`examples/sla-commitment.json`](./examples/sla-commitment.json).

To resolve: OC-team-B opens the pledge at `/p/<id>`, runs through the agreed deliverable check, and uses the future-v0.2 outcome-signing flow (or, until then, uses `orangecheck.pledge.create_outcome` from a Python REPL with the bonded wallet adapter).

### 3 — Open-source delivery (`http_get_hash` deterministic)

Pre-commit to the exact SHA-256 of a release artifact (a tarball, a wheel, a binary). When the artifact lands at the named URL, any verifier can independently confirm the body hash matches and resolve the pledge to `kept`.

**Template inputs:**

| Composer field | Value |
|---|---|
| `swearer` | _OC-team release-maintainer address_ |
| `proposition` | `<package> v<version> will publish at <https URL> with body_sha256 == <hash>.` |
| `resolution.mechanism` | `http_get_hash` |
| `resolution.query` | `GET <https URL> body_sha256 == <hash>` |
| `resolves_at` | `time: <release deadline>T00:00:00Z` |
| `expires_at` | `time: <deadline + 7 days>T00:00:00Z` |
| `bond` | _(your attestation)_ |
| `counterparty` | _(blank)_ |
| `dispute.mechanism` | `null` |

Reference shape pinned in [`examples/oss-delivery.json`](./examples/oss-delivery.json).

To resolve: publish the binary at the URL on or before the deadline. Any verifier (including the future-v0.2 `/p/<id>` deterministic re-evaluator) fetches the URL, confirms `sha256(body) == hash`, and the pledge classifies as `kept`.

## Sequence

For each of the three pledges:

1. Open <https://pledge.ochk.io/create> in a browser with your wallet connected.
2. Fill in the fields above. Watch the live canonical-message preview rebuild on every keystroke; the `pledge_id` derives from `sha256(canonical_message)` and changes if any field changes (including the auto-rotated nonce).
3. Click **sign with wallet**. Your wallet prompts you to sign the lowercase-hex pledge id (NOT the canonical message — SPEC §3.5; the composer post-Task #3 wires this correctly).
4. Click **publish to nostr**. Watch the toast for `n/4 relays` confirmation. The composer redirects to `/p/<id>#<base64url envelope>` so you see your pledge instantly even before relay propagation.
5. Verify by opening `/p/<id>` (without the fragment) in a fresh tab — the resolver fetches kind-30078 with `#d=oc-pledge:<id>` from the default relay set and re-runs the full verify chain.
6. Verify externally by piping the envelope JSON into the conformance harness:
   ```sh
   python -c "
   from orangecheck.pledge import verify_pledge
   import json
   env = json.loads(open('your-pledge.json').read())
   r = verify_pledge(env, verify_bip322=lambda m, s, a:
       __import__('orangecheck.verify_sig', fromlist=['verify_bip322_signature']).verify_bip322_signature(a, m, s))
   print(r)
   "
   ```

## After publication

For each new pledge:

1. Add or update a row in the **Live case studies** table in `PROTOCOL.md` with the `pledge.ochk.io/p/<id>` URL, swearer address, and resolution-mechanism shape.
2. Wait for the pledge to fully resolve (the OSS-delivery and research-preregistration shapes are typically fastest). Update the case study with the resulting outcome envelope id once classified.
3. If the publication exercises a new shape not previously covered (e.g. the first agent-delegated dogfood pledge), call it out in `CHANGELOG.md` so subsequent readers can find the worked example.

## Why this is a real gate, not a checkbox

Every other family member shipped through this same loop — OC Stamp's first stamps were OC team artifacts, OC Vote's first polls were OC team polls. The "live envelopes from real OC keys against real OrangeCheck bonds" property is what makes the next consumer's first pledge feel like joining a working network rather than testing a draft. v1.0 was cut after this gate fired; future major releases will follow the same discipline.
