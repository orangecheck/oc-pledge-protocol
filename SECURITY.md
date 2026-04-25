# Security Policy

## Reporting a vulnerability

Email **security@ochk.io** with:

- A clear description of the issue and the affected component.
- Reproduction steps (proof-of-concept preferred; minimal test vector is fine).
- Your assessment of impact: what can an attacker do, under what assumptions?
- Whether you want credit when we publish the fix.

We aim to acknowledge within 48 hours and publish a fix for high/critical issues within 14 days. Do not file public GitHub issues for suspected vulnerabilities.

## Scope

This document covers the **OC Pledge v0.1 protocol specification** in this repository. The reference implementation lives in [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages); the web client (when shipped) lives in `orangecheck/oc-pledge-web`. Each of those has its own `SECURITY.md`.

## Threat model

### What OC Pledge protects

- **Authenticity of the swearer** against forgery. The BIP-322 signature in `sig.value` binds the pledge id to the swearer's Bitcoin address (or to a delegated agent's address, with the principal as the unit of accountability). Forging a pledge requires the corresponding private key.
- **Integrity of the canonical message.** The pledge id is `H(canonical_message_bytes)` and is committed to by `sig.value`. Any modification to the proposition, resolution mechanism, deadline, bond, counterparty, dispute mechanism, sworn_at, or nonce invalidates the id and the signature.
- **Bond claim integrity.** The `bond` block is committed to by the signed pledge id. A swearer cannot retroactively reduce the bond after committing.
- **Outcome-envelope integrity.** Outcome envelopes commit to the pledge id and the evidence; tampering invalidates the envelope's id and (where required) signature.
- **Resolution determinism.** For `chain_state`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`, and `vote_resolves` mechanisms, two verifiers with the same public state produce byte-identical outcome envelopes.
- **State-machine consistency.** The §4.4 transition function is a pure function; two verifiers with the same inputs produce the same state classification.
- **Public-record permanence.** A pledge's outcome (kept, broken, expired_unresolved, disputed) is attached to the swearer's Bitcoin address and is observable to any verifier with Nostr access.

### What OC Pledge does not protect

- **Address linkability through pledge history.** The swearer's address is plaintext in every pledge envelope. A swearer who pledges from the same address over time exposes a public record of their commitments — by mechanism, by counterparty, by bond size, by outcome. This is a **privacy cost** of the protocol's value proposition (the public ledger is the entire teeth). Swearers who want pseudonymous pledges MUST swear from a fresh address — at the cost of losing identity continuity with prior pledges and any aggregated bond signal. See §"address linkability" in attack scenarios.
- **Off-protocol dispute escalation.** The protocol exposes a pre-named dispute mechanism (`vote_resolves` or `named_oracle`) and refuses to embed any post-hoc trust-ranking. Disputes that cannot be resolved by the named mechanism time out to `expired_unresolved`.
- **Recency of `sworn_at`.** The signer sets `sworn_at`; it is not forgery-proof. Verifiers MAY reject pledges whose `sworn_at` is far in the future of their wall clock.
- **Counterparty cooperation.** A `counterparty_signs` pledge depends on the counterparty's willingness to sign. A non-signing counterparty drives the pledge to `expired_unresolved`.
- **Bond seizure.** Bonds are commitments, not custody. The protocol cannot transfer or burn the bonded sats. Enforcement is by public-record exposure only.
- **Post-quantum confidentiality / authenticity.** secp256k1 and SHA-256 both break under a sufficiently large quantum computer. There is no PQ layer in v0.1.

### Assumptions the protocol makes

- **Bitcoin's security model holds.** ECDSA / Schnorr over secp256k1 remains unforgeable at current parameter sizes; the work-weighted longest chain is canonical.
- **BIP-322 is implemented correctly** by both signing and verifying clients across all common address types (P2WPKH, P2TR, P2WSH, P2PKH).
- **SHA-256 is collision-resistant.** A practical SHA-256 collision breaks pledge id uniqueness and downstream guarantees.
- **At least one queried Nostr relay is non-colluding** when looking up `nostr_event_exists` or `stamp_published` resolutions. Implementations MUST query at least two relays from the family default set.
- **At least one queried DNS-over-HTTPS resolver is non-colluding** for `dns_record` resolutions.
- **OrangeCheck attestations are resolvable against current chain state.** Bond verification depends on this.

## Normative compliance requirements

These are cryptographic correctness conditions that conforming implementations MUST satisfy:

1. **Reconstruct the canonical message before trusting the declared `id`.** Implementations MUST compute `H(canonical_message)` from the canonical-message inputs and compare to `envelope.id`. Accepting the declared `id` without reconstruction allows attackers to swap signed content.
2. **Verify `sig.value` before trusting envelope contents.** No exceptions in v0.1.
3. **Re-resolve every bond against live chain state** (SPEC §8) before attaching consequential weight to a pledge. Trusting a stale snapshot allows bond-draining attacks.
4. **Recompute deterministic outcome evidence on-demand.** A verifier presented with a deterministic outcome envelope SHOULD recompute the witness from public state.
5. **Verify `counterparty_signs` outcome signatures under the named counterparty's address.** An outcome envelope signed by a stranger MUST be rejected with `E_OUTCOME_RESOLVER_UNAUTHORIZED`.
6. **Treat abandonment as broken.** No client may distinguish `abandoned` from `broken` in the public ledger.
7. **Reject empty nonces.** A pledge with `nonce: ""` MUST fail at envelope construction.
8. **Reject unknown `v` values.** Preserve unknown optional fields when relaying; ignore them when verifying.
9. **Produce byte-identical canonical messages** for identical inputs across implementations.
10. **Sign the hex form of every id** (64 ASCII bytes) with BIP-322, not the raw 32 bytes.

## Known cryptographic caveats

- **Signature malleability.** BIP-322 signatures over Schnorr addresses (P2TR) are non-malleable. ECDSA signatures (legacy P2PKH, P2WPKH) are technically malleable, but the pledge id is bound into the signed message, so a malleated re-issue would still need the private key and would not change the pledge id.
- **No side-channel guarantees.** JavaScript crypto libraries (including `@noble/*`) make best-effort constant-time operations; a hostile host can time them anyway.
- **Nostr relay availability.** A pledge published to relays that all go offline is still a valid envelope (signed and id-bound); it just may not be discoverable until republished. Verifiers SHOULD treat absence-of-pledge differently from presence-of-broken-pledge.
- **DNS-over-HTTPS resolver poisoning.** Implementations MUST query at least two independent resolvers (SPEC §3.4.6). A coordinated attack on the named-resolver set is a realistic threat for high-value pledges; multi-resolver agreement mitigates.

## Attack scenarios

Each scenario is labeled **Mitigated**, **Partially mitigated**, **Accepted**, or **Out of scope**.

1. **Envelope tampering in transit.** An attacker modifies the proposition, resolution mechanism, deadline, bond reference, counterparty, or any other field. *Mitigated*: the envelope id is `H(canonical_message)` and is committed to by `sig.value`. Tampering fails signature verification.

2. **Replay of a BIP-322 signature across canonical messages.** An attacker takes a signature from a different OrangeCheck-family canonical message (a stamp, an attestation, an agent delegation, a vote ballot) and claims it covers a pledge. *Mitigated*: the pledge canonical message begins with `oc-pledge/v1` as a domain separator. A signature over a non-pledge message cannot verify against a pledge id. Same-domain replay across pledges is mitigated by the mandatory `nonce` field.

3. **Address linkability through pledge history (privacy cost).** A swearer's address is plaintext in every pledge envelope. An adversary who collects all `oc-pledge:*` envelopes can build a profile: how many pledges, which mechanisms, which counterparties, which bond sizes, which outcomes. *Accepted*: this is the architectural cost of the public-ledger value proposition. Swearers who want pseudonymous commitments swear from a fresh address per pledge — at the cost of losing the aggregated history that gives the bond signal continuity. The protocol surfaces this trade-off in WHY.md and SPEC §"What OC Pledge does not protect."

4. **Dispute-gaming via contradictory outcome envelopes.** In a `counterparty_signs` pledge, the counterparty publishes a `broken` outcome while the swearer publishes a `kept` outcome (or vice versa). *Mitigated*: the state machine classifies the pledge as `disputed` (§4.4). If the pledge has `dispute.mechanism != null`, the dispute is referred to that mechanism (e.g., a pre-named OC Vote poll). If `null`, the pledge times out to `expired_unresolved`. Neither party can unilaterally force a kept/broken outcome.

5. **Bond-draining attack.** A swearer commits to a pledge bonding 5M sats × 90 days, then spends the bonded UTXO mid-pledge. The bond signal becomes false. *Partially mitigated*: SPEC §8 requires verifiers to re-resolve the bond against live chain state. A spent UTXO triggers `E_BOND_SPENT`; verifiers requiring an active bond at verification time treat the pledge as bond-invalid (functionally equivalent to a broken pledge in their policy). The state-machine classification (§4.4) is driven by outcome / abandonment envelopes — the protocol does not auto-classify spent-bond as `broken`. Consumer policy decides whether to count the pledge in the kept-rate denominator. *Accepted residual risk*: a swearer who spends mid-pledge AND posts a kept outcome (in a counterparty_signs pledge where the counterparty colludes or is silent) gets a `kept` ledger entry alongside an invalid bond. Verifiers who care about bond integrity must check both.

6. **Forged outcome envelope by a stranger.** A non-counterparty publishes an outcome envelope claiming to resolve a `counterparty_signs` pledge. *Mitigated*: SPEC §10 requires verifiers to check `outcome.sig.pubkey == pledge.counterparty` for `counterparty_signs` mechanisms. Strangers fail with `E_OUTCOME_RESOLVER_UNAUTHORIZED`.

7. **Race-to-abandon attack.** A swearer foreseeing a foreseeable resolution failure rushes to publish an abandonment envelope to dodge the `broken` classification. *Mitigated by design*: abandonment counts as `broken` in the public ledger (SPEC §5.4, WHY §H8). There is no honorable-exit ledger state that rewards the race.

8. **Deadline gaming via wall-clock manipulation.** A swearer claims a `time:` deadline and disputes that the verifier's clock matches. *Mitigated for high-stakes pledges*: swearers SHOULD use `block:` deadlines, which anchor to Bitcoin block headers and are non-malleable. Wall-clock deadlines are accepted for short-horizon use cases where the swearer's clock is acceptable.

9. **Replay of a pledge canonical message after resolution.** An attacker takes the canonical message of a kept pledge and tries to "swear" the same pledge again to inflate the swearer's kept-count. *Mitigated*: the mandatory `nonce` field guarantees that two pledges with otherwise-identical content have different ids. The signature commits to the id. Re-publishing the same envelope produces the same id; there is no second pledge.

10. **Malicious Nostr relay returns a manipulated envelope.** A relay serves a tampered pledge or outcome envelope. *Mitigated*: verifiers re-derive id from the canonical message and re-check BIP-322. Manipulated envelopes fail verification regardless of relay.

11. **Stale-bond presentation.** An attacker presents a verifier with a cached OrangeCheck attestation snapshot from when the bond was valid, hoping the verifier won't re-resolve. *Mitigated by SPEC §11.3*: implementations MUST re-resolve bonds against live chain state. Verifiers that cache results MUST honor a TTL and re-query before consequential decisions.

12. **HTTP-resolution geo-restriction.** A swearer's `http_get_hash` URL serves the expected content to North American IPs but 404s elsewhere. *Partially mitigated*: SPEC §3.4.5 requires majority-of-three-verifications for contested pledges. Sufficiently determined geo-fencing can produce different majorities in different regions; this is an inherent limit of HTTP resolution and is documented as a known limit.

13. **DNS resolution poisoning.** A targeted attack on a swearer's DNS authoritative records can flip `dns_record` outcomes. *Partially mitigated*: SPEC §3.4.6 requires multi-resolver agreement across at least two of (Cloudflare, Google, Quad9). A coordinated DNS attack on a swearer's records would require compromising the authoritative records themselves, not the resolvers.

14. **Counterparty refuses to sign (silent griefing).** A `counterparty_signs` pledge is delivered, but the counterparty stays silent through `expires_at` to deny the swearer a `kept` record. *Accepted with named recourse*: the pledge resolves to `expired_unresolved`. Swearers who anticipate this risk SHOULD pre-name a `dispute.mechanism` (e.g., `vote_resolves` with a council poll) so the contradiction can be adjudicated.

15. **Agent goes rogue under unscoped delegation.** A principal issues an OC Agent delegation with `pledge:create` scope and no constraints; the agent swears pledges the principal didn't intend. *Mitigated by scope grammar*: SPEC §7.3 supports `max_bond_sats`, `mechanism`, and `counterparty` constraints. Principals SHOULD issue narrowly-scoped delegations. *Residual risk accepted*: a principal who issues an unconstrained delegation accepted the risk; the public ledger reflects that the principal is the swearer of record, with the delegation cited.

16. **Delegation forgery.** An attacker fabricates a delegation that authorizes them as agent for a target principal. *Mitigated*: the delegation is BIP-322-signed by the principal under OC Agent v1's verification rules. Fabricated delegations fail principal-signature check.

17. **Same-block resolution race.** A pledge resolves at a block height N; a transaction satisfying the predicate lands in block N+1 and the verifier classifies it as broken; another verifier sees the transaction in block N (different chain tip) and classifies it as kept. *Mitigated for confirmed transactions*: SPEC §3.4.1 grammar supports `>= confirmations` and `AT block(N)` predicates that pin evaluation to a specific block height. Fluctuation around the chain tip during evaluation is an inherent property of Bitcoin; verifiers SHOULD use a confirmation depth ≥ 6 for high-stakes pledges.

18. **Empty-nonce attack on pledge id uniqueness.** An attacker produces two pledges with identical content and (illegally) empty nonces, producing identical ids. *Mitigated*: SPEC §3.6 and §11.6 require non-empty nonces; envelope construction MUST reject. Test vector `v28-empty-nonce-rejected.json` pins this.

19. **Vote-poll manipulation in `vote_resolves` dispute.** A swearer pre-names an `vote_resolves` dispute with a poll the swearer secretly controls. *Accepted with named recourse*: the dispute mechanism is named **at swear time** in plain text. The counterparty (or the verifier) sees the named poll and can refuse to engage with the pledge. The protocol does not embed any judgment about poll legitimacy; consumers ship the policy.

20. **Side-channel leakage of BIP-322 signing.** A hostile host measures signing time to extract the private key. *Out of scope*: this is a wallet-implementation concern. OC Pledge assumes the swearer's wallet is not hostile.

21. **Collision of SHA-256 used for `pledge_id` or `bond.attestation_id`.** *Accepted*: SHA-256 collision resistance is a load-bearing assumption. A practical collision attack would break far more than OC Pledge; no protocol-level mitigation is meaningful.

22. **Key compromise of the swearer's Bitcoin private key.** An attacker with the key can forge arbitrary pledges indistinguishable from legitimate ones. *Accepted*: this is the same trust model as BIP-322 everywhere. Key rotation to a new address mitigates future risk; past pledges remain attached to the compromised address.

## Counterparty-specific risks

A `counterparty_signs` pledge depends on the counterparty's good faith for liveness:

- **Counterparty refuses to sign** → pledge resolves to `expired_unresolved` unless a `dispute.mechanism` was named. Plan accordingly.
- **Counterparty signs falsely (broken when actually kept, or vice versa)** → swearer counter-publishes contradictory outcome → pledge is `disputed` → named dispute mechanism resolves, or pledge times out.
- **Counterparty's address is compromised** → the attacker can sign arbitrary outcome envelopes. The counterparty should rotate keys and re-engage; pledges in flight are at risk.

Bilateral pledges are inherently fragile under counterparty malice. Use `dispute.mechanism` to provide recourse, or prefer deterministic mechanisms when possible.

## Dependency posture

The reference implementation will depend on a narrow set of audited libraries:

| Package | Purpose |
|---|---|
| `@noble/hashes` | SHA-256 |
| `@noble/curves` | secp256k1 Schnorr / ECDSA |
| `bip322-js` | BIP-322 verification |
| `@orangecheck/sdk` | OrangeCheck attestation resolution |
| `@orangecheck/stamp-core` | OC Stamp envelope verification (for `stamp_published` mechanism) |
| `@orangecheck/vote-core` | OC Vote tally function (for `vote_resolves` mechanism) |
| `@orangecheck/agent-core` | OC Agent delegation resolution (for `via_delegation` pledges) |

Implementations SHOULD pin to audited versions and migrate to `@noble`-based BIP-322 verifiers when available.

## Report a protocol-level concern

If you believe a clause of the specification itself is unsound (as opposed to a bug in an implementation), email security@ochk.io with subject line prefix `[protocol]`. Protocol-level concerns may trigger a spec revision; we version the spec strictly (SPEC §13).
