# Changelog

All notable changes to the OC Pledge protocol specification.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 2026-05

### Added — operational

- **`RUNBOOK.md`** — turn-key dogfood sequence the OC team executes before
  the v1.0 cut. Three pledges across the deterministic /
  counterparty-signs / dispute spread (research-preregistration via
  `stamp_published`, bilateral SLA via `counterparty_signs` +
  `vote_resolves` dispute, open-source delivery via `http_get_hash`).
  Each shape has template inputs for the composer at
  pledge.ochk.io/create, which now ships real signing + Nostr publish
  end-to-end (oc-pledge-web commit `584de0d`). Until the runbook fires,
  the protocol stays at `v0.1.0-alpha` and the homepage `preview` pill
  stays in place — same honesty discipline applied to the family-vitals
  reframing on ochk.io.

- **`PROTOCOL.md` — Live case studies table.** Pre-allocated rows for
  the three RUNBOOK shapes; filled in as each pledge publishes.

### v1.0 cut checklist (gated on RUNBOOK)

When the case-studies table in `PROTOCOL.md` has live URLs for all
three shapes (and ideally at least one resolved outcome envelope):

1. Bump `SPEC.md`:
   - `# OC Pledge Protocol v0.1 — Specification` → `# OC Pledge Protocol v1.0 — Specification`
   - `**Status:** Draft (v0.1.0-alpha)` → `**Status:** Stable`
   - The line `The first stable release is v1.0; v0.1.0-alpha is the initial draft published in this repository.` → drop or rewrite past-tense.
2. Bump `README.md`'s status block (`v0.1.0-alpha — initial draft published. Spec is implementer-ready; reference SDK and web client are forthcoming.` → match SPEC).
3. Add a `## [1.0.0] — YYYY-MM` entry in this CHANGELOG referencing the live case studies and the cross-impl conformance gate that's been green continuously.
4. Tag `v1.0.0` on this repo.
5. Bump `@orangecheck/pledge-core` to `1.0.0`, push tag `pledge-core-v1.0.0` (release.yml publishes to npm). Bump `orangecheck` (Python) to `1.0.0` similarly via `sdk-py-v1.0.0`.
6. Flip the homepage pill: `oc-www/src/pages/index.tsx` PROTOCOLS array, OC Pledge entry: `status: 'preview'` → `status: 'live'`. Drop the body addendum *"Spec is v0.1-alpha — protocol design is settled enough to read, not yet stable enough to depend on."*

The cut is mechanical once the runbook fires. The reason this checklist exists in CHANGELOG and not as immediate-bump diff is that v1.0/Stable claimed without real production envelopes is the same family of dishonesty the homepage's family-vitals → relay-demo reframing was correcting.

### Updated — SECURITY.md walked against the working reference implementations

The threat model in `SECURITY.md` was originally written against the spec
alone. With both reference implementations now in place
(`@orangecheck/pledge-core` 0.1.0 + `orangecheck.pledge` 0.2.0, every test
vector reproducing byte-identically across the two), the 22 scenarios
were re-walked against running code. No protocol changes; documentation
only.

- **New "Reference implementation status (2026-05)" section.** Names the
  v0.1 SDKs, what they cover (§9.1 steps 1–4 + 9), and what they don't
  yet cover by design (steps 5 + 8: bond live re-resolution and
  deterministic-mechanism re-evaluation; OC Agent §7.3 delegation lookup
  + scope enforcement). Pins the v0.2 cut-line where consumer responsibilities
  fold back into the SDKs.
- **Scenario 5 (bond-draining)** now carries an implementation note
  describing the SDK's pure-algorithm shape and the `/verify` /
  `/p/<id>` surfaces' explicit "envelope-only verification today"
  framing. Until the v0.2 chain accessor lands, consumers attaching
  consequential weight MUST run their own bond lookup.
- **Scenarios 15 + 16 (agent rogue / delegation forgery)** carry a
  matching note: the v0.1 SDKs check the agent path's envelope shape
  and BIP-322 signature against `agent_address` per §7.3 step 6, but
  do not yet perform steps 1–5 (delegation resolution + scope
  validation). Native agent-core integration is the headline v0.2
  gate. Consumers must layer agent-core's `verifyDelegation` separately
  in the meantime.
- **New scenario 23 — "URL-id mismatch via relay manipulation."**
  Surfaced during the `oc-pledge-web` `/p/<id>` resolver build. A
  malicious relay can return an event whose embedded envelope has a
  different id than the URL slug; the reference resolver hard-fails
  this case. Documented here so downstream resolver-builders apply the
  same defense.
- **New scenario 24 — "Wrong-target BIP-322 sign-target bug."**
  Surfaced during the same web-side migration: the pre-migration
  composer signed the canonical-message bytes instead of `hex(pledge_id)`
  (SPEC §3.5). The bug was caught and fixed in `oc-pledge-web` commit
  `584de0d`; documented here as an implementation hazard so other
  implementers verify their wallet adapter's sign target before
  shipping.

### Added — specification

- **`LIFECYCLE.md`** — normative companion document specifying that pledges are non-revocable, that `oc-pledge-abandonment/v1` is the only structured pre-deadline exit and counts as `broken` per `WHY.md` §H8, that bond withdrawal (UTXO spend) is permitted by Bitcoin and is therefore a *de facto* path to `broken` if it drops below `min_sats` / `min_days`, and that dashboard-local hide flags / NIP-09 deletion-request events have no protocol force. No protocol changes; clarification only.

## [0.1.0-alpha] — 2026-04

Initial draft of the sixth and final OrangeCheck-family primitive: **OC Pledge — bond-backed forward commitments with machine-resolvable outcomes**. The family of six verbs (am, whisper, decide, declare, delegate, swear) is now complete.

### Added — specification

- **`SPEC.md`** — the normative v0.1 specification.
  - §0 Notation; §1 Actors (swearer, counterparty, resolver, verifier, directory, agent); §2 Identities and the bond.
  - §3 Pledge envelope: canonical message format with exact field order, `oc-pledge/v1` domain separator, LF endings, ISO-8601 Z timestamps, decimal integers without leading zeros, mandatory 16-byte hex nonce. `pledge_id = sha256(canonical_message_bytes)`, lowercase hex.
  - §3.4 Seven resolution mechanisms with deterministic query grammars: `chain_state`, `counterparty_signs`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`, `vote_resolves`. `self_proof` is explicitly refused.
  - §4 Outcome envelope shape: `kept | broken | expired_unresolved | disputed`. Deterministic outcomes need no signature; `counterparty_signs` and resolved-by-non-deterministic mechanisms require BIP-322 from the resolver.
  - §4.4 Pure-function state machine: `pending → resolvable → kept | broken | disputed | expired_unresolved`.
  - §5 Abandonment envelope: counts as `broken` in the public ledger; no honorable-exit ledger state. Preempts the race-to-abandon attack.
  - §6 RFC 8785 canonicalization.
  - §7 Composition with OrangeCheck (bond), OC Stamp (`stamp_published` resolution), OC Vote (`vote_resolves` dispute), OC Agent (`pledge:create` delegation scope), OC Lock (out-of-band counterparty negotiation pattern).
  - §8 Bond verification algorithm. Bond is a re-resolvable OrangeCheck reference + `min_sats` + `min_days`. Verifier re-derives at verify time. Bond is never held in custody.
  - §9 Verification algorithm with full and minimal modes.
  - §10 Error codes (`E_PLEDGE_*`, `E_BOND_*`, `E_OUTCOME_*`, `E_ABANDONMENT_*`, `E_DELEGATION_*`).
  - §11–§17 Security-relevant requirements, registry hooks, versioning policy, future-work non-normative section, IANA / external identifiers, acknowledgements.
- **`PROTOCOL.md`** — five narrative flows: research preregistration (`chain_state` + `stamp_published`), bilateral SLA (`counterparty_signs`), open-source delivery (`http_get_hash`), agent-signed pledge (`via_delegation`), counterparty-refuses-to-sign edge case. Compare/contrast table against eight incumbents. Anti-patterns rejected.
- **`WHY.md`** — thirteen load-bearing hypotheses, each stated, stress-tested, and verdicted (KEPT / RETIRED). Explicit refusals: unrestricted free-text resolution, slashing via HTLC, aggregated reputation score, revocable pledges, trust-ranked dispute mechanisms, pledge chains, in-protocol negotiation, post-hoc juror lottery. Ed25519 substitution test. Why-not-each-incumbent section.
- **`SECURITY.md`** — threat model with twenty-two attack scenarios (status: Mitigated / Partially mitigated / Accepted / Out of scope). Includes the three brief-mandated scenarios: address linkability through pledge history (privacy cost), dispute-gaming via contradictory outcome envelopes, bond-draining via mid-pledge UTXO spend. Counterparty-specific risks documented.
- **`NIP_ORANGECHECK_PLEDGE.md`** — Nostr wire format. Three d-tag namespaces under kind 30078: `oc-pledge:<id>`, `oc-pledge-outcome:<id>`, `oc-pledge-abandonment:<id>`. Discovery query patterns, default relay set, replaceable-event behavior.
- **`REGISTRY.md`** — authoritative registry of mechanism strings, dispute mechanisms, remediation values, OC Agent `pledge:create` scope grammar. Documents twelve refused-by-design values with refusal reasons (`self_proof`, `slashing`, `revocation`, `kleros_court`, `trust_score`, etc.). Extension procedure requires working integrator code.

### Added — examples

- `examples/research-preregistration.json` — minimal `chain_state` + `stamp_published` composition.
- `examples/sla-commitment.json` — `counterparty_signs` with pre-named `vote_resolves` dispute.
- `examples/oss-delivery.json` — `http_get_hash` deterministic resolution.

Examples are dual-licensed: CC BY 4.0 (matching the spec) and MIT (matching the future reference SDK). See `examples/LICENSE-EXAMPLES`.

### Added — test vectors

Twenty-eight cross-implementation conformance fixtures in `test-vectors/`, with real SHA-256 ids and round-trip-verified canonical messages:

- **v01–v10:** Pledge envelopes covering all seven resolution mechanisms, agent-delegated pledges, and edge cases (resolves_at == expires_at, block-height resolution).
- **v11–v16:** Outcome envelopes (kept / broken / disputed / expired_unresolved) across deterministic and signed mechanisms.
- **v17:** Abandonment envelope canonical-message + id baseline.
- **v18–v20:** Bond verification (valid / insufficient sats / spent UTXO).
- **v21–v22:** Bilateral consistency (consistent / contradictory).
- **v23–v27:** State-machine transitions (pending / resolvable / kept / broken-via-abandonment / expired_unresolved).
- **v28:** Empty-nonce rejection (malformed-input fixture).

### Design principles

- **Bitcoin-load-bearing:** the combination of OrangeCheck `sats × days` bond + Bitcoin block-height time + BIP-322 swearer authentication is not substitutable on Ed25519. (WHY §H1, §H2, §H13)
- **No custody, ever:** the bond is a public commitment, never held by the protocol. Enforcement is by public-record exposure. (WHY §H7)
- **No KYC, no account, no permission:** the swearer's Bitcoin address is the identity; BIP-322 is the ceremony.
- **Content-addressed:** pledge / outcome / abandonment ids are SHA-256 of canonical bytes. Changing a field changes the id.
- **Offline-verifiable:** given the envelope plus public state (Bitcoin chain, Nostr relays, HTTPS endpoints, DNS, OrangeCheck), any verifier classifies state without trusting any service.
- **Resolution = pure function of public state:** seven mechanisms; no oracles in the critical path; `self_proof` refused.
- **Raw metrics over aggregated scores:** the protocol exposes `pledges_sworn`, `outcomes_for`, `bond_in_flight` as raw queries; consumers ship the policy. (WHY §H6)
- **Pledges cannot be revoked:** abandonment is the only graceful exit and counts as broken. No honorable-exit ledger state. (WHY §H8)
- **Trust anchors named, not hidden:** dispute mechanism is named at swear time in plaintext.

### License

- Spec, prose, and JSON test vectors: CC BY 4.0.
- Example envelopes in `examples/`: dual-licensed CC BY 4.0 and MIT.
- Reference SDK (forthcoming, in `oc-packages`): MIT.

### Acknowledgements

Stands on the discipline of OrangeCheck (bond), OC Stamp (envelope shape), OC Vote (pure-function resolution), OC Agent (delegation), and OC Lock (transport-agnostic envelopes). Credits **Bram Kanstein** for the "Bitcoin as sovereignty substrate" framing that grounds the entire family.

The six verbs of sovereign sociality — am, whisper, decide, declare, delegate, **swear** — are now complete.
