# OC Pledge Protocol

**Bitcoin-bonded forward commitments. Sworn with your wallet, resolved by public state, recorded in a permissionless ledger forever.**

OC Pledge is the **swear** verb in the OrangeCheck family — a commitment primitive for forward-looking, cryptographically-signed, bond-backed declarations about future-verifiable propositions. Anyone can swear a pledge with the Bitcoin wallet they already own. Anyone can verify the outcome offline from public state.

A pledge proves four things at once:

1. **Authorship** — a specific Bitcoin address signed this exact proposition (BIP-322).
2. **Bond** — the swearer committed sats × days unspent via an [OrangeCheck](https://docs.ochk.io/attest) attestation. Funds never move; the bond is a public commitment, not custody.
3. **Resolution mechanism** — one of seven deterministic mechanisms over public state (Bitcoin chain, Nostr events, OC Stamp envelopes, HTTP hashes, DNS records, OC Vote tallies, or counterparty BIP-322 signatures).
4. **Public ledger** — the kept-or-broken outcome attaches to the swearer's address forever, queryable by any verifier.

Strip any of those and the system degrades to a notary, an escrow, or a token-gated attestation. The combination is what makes OC Pledge Bitcoin-load-bearing and not substitutable on Ed25519.

OC Pledge is the **sixth and final primitive** in the [OrangeCheck](https://ochk.io) family. It composes with all five existing primitives and replaces none of them.

> *Pledge your word to Bitcoin. Swear a proposition. Bond your stake. Anyone verifies the outcome.*

## The six verbs

| Verb       | Sub-protocol  | What it does                                           |
|------------|---------------|--------------------------------------------------------|
| **am**     | OC Attest     | "I have stake now" — sybil-resistant identity         |
| **whisper**| OC Lock       | "I can receive now" — confidential envelopes          |
| **decide** | OC Vote       | "I chose now" — offline-tallyable polls               |
| **declare**| OC Stamp      | "I said this now" — block-anchored content provenance |
| **delegate**| OC Agent     | "I authorize now" — scoped delegation                 |
| **swear**  | **OC Pledge** | "I commit forward now" — bond-backed future-verifiable propositions |

Five present-state declarations. One forward commitment. The family is now complete.

## This repo

This repository is the **normative protocol specification**. No code lives here — only:

| File | What it is |
|---|---|
| [`SPEC.md`](./SPEC.md) | The normative v0.1 specification — canonical messages for pledge / outcome / abandonment, seven resolution mechanisms, state machine, bond verification, error codes, compliance checklist. |
| [`PROTOCOL.md`](./PROTOCOL.md) | Narrative walkthrough with five flows (preregistration, SLA, OSS delivery, agent-delegated pledges, edge cases). |
| [`WHY.md`](./WHY.md) | Design rationale. Thirteen load-bearing hypotheses. The explicit refusals (slashing, aggregated reputation, revocation, free-text proofs, trust-ranked dispute, pledge chains). |
| [`SECURITY.md`](./SECURITY.md) | Threat model, trust assumptions, 22 attack scenarios with status, compliance requirements, report channel. |
| [`NIP_ORANGECHECK_PLEDGE.md`](./NIP_ORANGECHECK_PLEDGE.md) | The Nostr wire format. Three d-tag namespaces under kind 30078. |
| [`REGISTRY.md`](./REGISTRY.md) | Authoritative registry of mechanism strings, dispute mechanisms, scope grammar extensions. Refuses `self_proof`, `slashing`, etc. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history. |
| [`test-vectors/`](./test-vectors/) | 28 cross-implementation conformance fixtures. Real SHA-256 ids; round-trip verified at authoring time. |
| [`examples/`](./examples/) | Three minimal envelope examples: research preregistration, SLA, OSS delivery. |

## Reference implementation

The TypeScript reference implementation will be published to **npm** from the [`oc-packages`](https://github.com/orangecheck/oc-packages) monorepo as `@orangecheck/pledge-core` (and `@orangecheck/pledge-resolvers` for the seven mechanism resolvers). Not yet published — the spec is shipped first.

## Test vectors

The [`test-vectors/`](./test-vectors/) directory holds 28 cross-implementation conformance fixtures grouped as:

- **Pledge envelopes (v01–v10):** all seven resolution mechanisms, agent-delegated, edge cases (resolves_at == expires_at, block-height resolution).
- **Outcome envelopes (v11–v16):** kept / broken / disputed / expired_unresolved across deterministic and signed mechanisms.
- **Abandonment envelope (v17):** the canonical-message + id baseline.
- **Bond verification (v18–v20):** valid, insufficient sats, spent UTXO.
- **State transitions (v21–v27):** bilateral consistency, contradictory outcomes, pending/resolvable/kept/broken/expired-unresolved transitions.
- **Malformed input (v28):** empty-nonce rejection.

Each vector has fixed `inputs` and `expected` fields. A conforming implementation produces byte-identical canonical messages and matching SHA-256 ids for every vector. See [`test-vectors/README.md`](./test-vectors/README.md).

## Examples

The [`examples/`](./examples/) directory contains three runnable envelopes:

- `research-preregistration.json` — `chain_state` + `stamp_published` composition.
- `sla-commitment.json` — `counterparty_signs` with pre-named `vote_resolves` dispute.
- `oss-delivery.json` — `http_get_hash` deterministic resolution.

Each example file has a comment block at the top describing the flow. Actual TypeScript code shipping these examples will land in `oc-packages` after the spec stabilizes.

## How it works (one paragraph)

A swearer holds a Bitcoin address with an OrangeCheck attestation. To swear a pledge, the swearer composes a short canonical message that binds (address, proposition, resolution mechanism + query, deadline, bond reference + minimum thresholds, optional counterparty, optional dispute mechanism, sworn-at, nonce) and signs it once with BIP-322. The pledge id is the SHA-256 of those canonical bytes. The signed envelope is published to Nostr kind-30078 with d-tag `oc-pledge:<id>`. At resolution time, a paired outcome envelope (deterministic for five of the seven mechanisms, signed by the named resolver for the other two) is published with d-tag `oc-pledge-outcome:<id>`. The state machine — pending → resolvable → kept | broken | disputed | expired_unresolved — is a pure function of the envelopes plus public state. The bond never moves; enforcement is by public-record exposure.

For durable public discovery, all three envelope kinds (pledge, outcome, abandonment) share Nostr kind 30078 with disjoint d-tag namespaces. Verification needs no proprietary endpoint.

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  oc-pledge-web        create / verify / open UI (TBD)           │
│  oc-pledge CLI        swear / resolve / classify                │
├─────────────────────────────────────────────────────────────────┤
│  @orangecheck/pledge-core         canonical msg, envelope, state│
│  @orangecheck/pledge-resolvers    7 resolution mechanisms       │
├─────────────────────────────────────────────────────────────────┤
│  OrangeCheck         bond reference (sats × days)               │
│  OC Stamp            stamp_published resolution                 │
│  OC Vote             vote_resolves dispute / resolution         │
│  OC Agent            agent-signed pledges (pledge:create scope) │
│  OC Lock             out-of-band counterparty negotiation       │
│  Nostr               three d-tag namespaces under kind 30078    │
│  Bitcoin             address ownership (BIP-322), block heights │
└─────────────────────────────────────────────────────────────────┘
```

## Composition with the family

OC Pledge composes with every other family primitive by design:

- **Bond signal** ← OrangeCheck attestation, re-resolved at verify time.
- **Resolution: stamp_published** → OC Stamp envelope lookup.
- **Resolution: vote_resolves** → OC Vote tally function.
- **Dispute: vote_resolves** → OC Vote poll outcome.
- **Agent-signed pledges** ← OC Agent delegation with `pledge:create` scope.
- **Confidential negotiation** → OC Lock envelopes, out-of-band.

None of these are extensions of this protocol — they are usage patterns made trivial by referencing existing specs.

## Related repositories

- [`orangecheck/oc-attest-protocol`](https://github.com/orangecheck/oc-attest-protocol) — the progenitor: Bitcoin-bonded identity.
- [`orangecheck/oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol) — confidential envelopes addressed to a Bitcoin address.
- [`orangecheck/oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol) — offline-tallyable polls.
- [`orangecheck/oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol) — block-anchored content provenance.
- [`orangecheck/oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol) — scoped delegation.
- [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages) — TypeScript SDK monorepo (publishes `@orangecheck/*` to npm).

## Status

v0.1.0-alpha — initial draft published. Spec is implementer-ready; reference SDK and web client are forthcoming.

## Positioning

OC Pledge is designed to **compose with, not replace**, existing commitment systems:

- **OSF / preregistration registries** are excellent for academic preregistration, but the registrar is a custodian and the resolution is free-text. OC Pledge replaces the registrar with a protocol; resolution is machine-deterministic.
- **Multi-sig escrow / HTLC** is excellent for bilateral economic instruments, but custodies the funds. OC Pledge bonds without custody.
- **EAS / Ethereum attestations** are excellent for the Ethereum ecosystem, but token-gated and RPC-dependent. OC Pledge is for the open web that isn't a token economy.
- **Kleros / arbitration courts** are excellent in their domains, but embed specific token economies. OC Pledge exposes `dispute.mechanism` as a hook the swearer chooses.
- **Snapshot / Helios** solve a different verb (group preference, not individual commitment).
- **GitHub release SLAs / npm OWNERS** are soft commitments without economic stake or machine-verifiable resolution.

See [`WHY.md`](./WHY.md) for the full design rationale and the explicit refusals.

## License

The specification and prose are CC BY 4.0; see [LICENSE](./LICENSE). Example code in [`examples/`](./examples/) is dual-licensed and additionally available under MIT; see [`examples/LICENSE-EXAMPLES`](./examples/LICENSE-EXAMPLES). The reference implementation in `oc-packages` will be MIT.
