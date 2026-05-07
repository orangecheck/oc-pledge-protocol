# OC Pledge — Registry

This file is the authoritative registry for extensible string values in OC Pledge envelopes. The brief governance rule: implementations MAY emit and consume the values listed here; they MAY NOT emit values that this registry has not blessed; they MUST tolerate unknown values on relay (per SPEC §3.7) but SHOULD NOT verify them.

The registry is governed by PR to this file. New entries require working integrator code in at least one reference implementation. Speculative entries are refused.

---

## 1. `resolution.mechanism`

The seven values in v1.0 are exhaustive. Adding an eighth is a spec change with a `v` bump (SPEC §13).

| Value | Status | Determinism | First introduced |
|---|---|---|---|
| `chain_state` | accepted | deterministic | v1.0 |
| `counterparty_signs` | accepted | non-deterministic (requires named signature) | v1.0 |
| `nostr_event_exists` | accepted | deterministic (modulo relay availability) | v1.0 |
| `stamp_published` | accepted | deterministic | v1.0 |
| `http_get_hash` | accepted | deterministic (modulo network conditions; majority-of-3 rule) | v1.0 |
| `dns_record` | accepted | deterministic (multi-resolver) | v1.0 |
| `vote_resolves` | accepted | deterministic (OC Vote tally is pure) | v1.0 |

### Refused mechanisms

These are **explicitly refused** in v1.0. Implementations that encounter them MUST reject the pledge with `E_RESOLUTION_UNKNOWN` or `E_RESOLUTION_NONDETERMINISTIC`.

| Value | Refusal reason |
|---|---|
| `self_proof` | A pledge whose truth requires the swearer's own assertion as proof is not in scope for this protocol. The protocol's value proposition is machine-resolvability from public state; `self_proof` reduces to "trust me." See WHY §H3. |
| `arbiter_decides` | A pledge resolved by an unconstrained third-party human judgment is a notary-substitute, not a sovereign primitive. Use `vote_resolves` with a named voter set if you need group judgment, or `counterparty_signs` with a named adjudicator as the counterparty. |
| `oracle_feed` | A floating-point oracle feed (price, weather, sports score) introduces an oracle-as-trust-anchor without naming it. Use `http_get_hash` against a specific oracle endpoint and treat the oracle as a named, plaintext trust anchor. |
| `kleros_court` | Embeds a specific token-economy arbitration system. Use `vote_resolves` with whatever voter set you choose, or build a Kleros bridge as a `named_oracle` dispute mechanism. |
| `escrow_release` | Requires custody. The protocol has no custody primitive and refuses one (WHY §H7). |

---

## 2. `dispute.mechanism`

| Value | Status | Resolver | First introduced |
|---|---|---|---|
| `null` | accepted | n/a — disputes time out to `expired_unresolved` | v1.0 |
| `vote_resolves` | accepted | OC Vote poll named in `dispute.params` | v1.0 |
| `named_oracle` | accepted | A specific Bitcoin address named in `dispute.params`. Their BIP-322 signature over a "dispute resolution" envelope is the dispute outcome. | v1.0 |

### `vote_resolves` dispute params grammar

```
poll_id=<64-hex>;option=<option_id>;threshold=<decimal in [0.0, 1.0]>
```

### `named_oracle` dispute params grammar

```
oracle=<btc_address>
```

The named oracle publishes a single outcome envelope with `outcome.resolved_by == <oracle_address>` and BIP-322 signature. Verifiers accept this as the dispute resolution.

### Refused dispute mechanisms

| Value | Refusal reason |
|---|---|
| `trust_score` | Embeds a reputation system. The protocol explicitly refuses aggregated reputation (WHY §H6). |
| `juror_lottery` | Trust-ranks dispute participants post-hoc. The dispute mechanism is named at swear time (WHY §H9). |
| `auction_resolution` | Embeds a token economy. |

---

## 3. `remediation`

| Value | Status | Meaning | First introduced |
|---|---|---|---|
| `breach_recorded` | accepted | A broken pledge attaches to the swearer's address in the public ledger. No further action by the protocol. | v1.0 |

### Refused remediations

| Value | Refusal reason |
|---|---|
| `slashing` | Requires custody (WHY §H7). |
| `auto_payout` | Requires custody and routing. |
| `escrow_release` | Requires custody. |
| `revocation` | Pledges cannot be revoked (WHY §H8). |
| `pledge_chain_continuation` | v1.0 explicitly defers pledge chains (WHY §H10). |

---

## 4. OC Agent `pledge:create` scope grammar

For agent-signed pledges (SPEC §7.3), the OC Agent delegation's scope grammar is extended with the following forms:

| Scope form | Meaning |
|---|---|
| `pledge:create` | Unconstrained: agent may swear any pledge on the principal's behalf. |
| `pledge:create(max_bond_sats=<N>)` | Bond ceiling: pledge `bond.min_sats <= N`. |
| `pledge:create(mechanism=<m>)` | Restricts agent to the named resolution mechanism. |
| `pledge:create(counterparty=<addr>)` | Restricts agent to pledges with the named counterparty (or, for `null`, no counterparty). |
| `pledge:create(max_bond_sats=<N>,mechanism=<m>)` | Conjunction. |
| `pledge:create(max_bond_sats=<N>,counterparty=<addr>)` | Conjunction. |
| `pledge:create(mechanism=<m>,counterparty=<addr>)` | Conjunction. |
| `pledge:create(max_bond_sats=<N>,mechanism=<m>,counterparty=<addr>)` | Three-way conjunction. |

Constraints inside parentheses are comma-separated (no spaces). A pledge passes scope check iff every named constraint is satisfied. Unknown constraint keys MUST cause the verifier to reject the pledge with `E_DELEGATION_SCOPE_VIOLATED` (fail-closed for unknown constraint vocabulary).

The OC Agent v1 spec ([SPEC §7](https://github.com/orangecheck/oc-agent-protocol/blob/main/SPEC.md)) governs the broader scope grammar; this section adds only the `pledge:create` forms.

---

## 5. Algorithm registry

| Field | Value | First introduced |
|---|---|---|
| `swearer.alg` | `bip322` | v1.0 |
| `sig.alg` | `bip322` | v1.0 |

Reserved future values: `bip340-schnorr-direct`, `pq-hybrid` (post-quantum hybrid signing). Adding either is a `v` bump.

---

## 6. Mechanism-specific evidence registry

For each mechanism, the canonical `evidence.witness` form is:

| Mechanism | Witness form |
|---|---|
| `chain_state` | `chain_height=<N> chain_hash=<64-hex>` |
| `counterparty_signs` | `counterparty_sig=<base64 BIP-322>` |
| `nostr_event_exists` | `nostr_event_id=<64-hex>` |
| `stamp_published` | `nostr_event_id=<64-hex>` (the OC Stamp envelope's Nostr id) |
| `http_get_hash` | `http_response_hash=<64-hex>` |
| `dns_record` | `dns_response=<single-line canonical answer>` |
| `vote_resolves` | `vote_poll_id=<64-hex>` |

Implementations MUST emit these forms. Unknown forms MAY appear in pre-extension envelopes; verifiers SHOULD treat them as opaque and recompute deterministic evidence from public state for known mechanisms.

---

## 7. Extension procedure

To propose a new mechanism, dispute mechanism, remediation, or scope form:

1. Open a PR against this file with the proposed value, its grammar, and its determinism class.
2. Provide a reference implementation in `@orangecheck/pledge-core` (or its successor) that produces and verifies envelopes using the proposed value.
3. Provide at least three test vectors in `test-vectors/` covering: simplest case, edge case, malformed input.
4. Document the trust model: who is trusted for what, what assumptions are made about public state.
5. Open a separate PR against `oc-pledge-protocol/SPEC.md` if the proposal requires a `v` bump.

Speculative proposals (without working integrator code) are refused. The registry is the boundary between "considered and accepted" and "not yet shippable."

---

## 8. Refused-by-design summary

This is the consolidated list of mechanisms, remediations, and dispute paths the protocol **refuses** in v1.0. Implementations MUST reject pledges that attempt them.

| Refused | Where refused | Why |
|---|---|---|
| `self_proof` resolution | §1 | Free-text "trust me"; not machine-resolvable from public state. (WHY §H3) |
| `arbiter_decides` resolution | §1 | Unconstrained third-party judgment; not sovereign. |
| `oracle_feed` resolution | §1 | Implicit oracle trust; use `http_get_hash` with a named endpoint instead. |
| `kleros_court` resolution | §1 | Embeds a specific token-economy arbitration system. |
| `escrow_release` resolution | §1 | Requires custody. |
| `slashing` remediation | §3 | Requires custody (WHY §H7). |
| `auto_payout` remediation | §3 | Requires custody. |
| `revocation` remediation | §3 | Pledges cannot be revoked (WHY §H8). |
| `pledge_chain_continuation` remediation | §3 | Deferred from v1.0 (WHY §H10). |
| `trust_score` dispute | §2 | Embeds a reputation system (WHY §H6). |
| `juror_lottery` dispute | §2 | Post-hoc trust-ranking (WHY §H9). |
| `auction_resolution` dispute | §2 | Embeds a token economy. |

These refusals are not bugs or omissions; they are deliberate boundaries that distinguish OC Pledge from notary-substitutes, custody-based commitments, and token-economy attestation systems.
