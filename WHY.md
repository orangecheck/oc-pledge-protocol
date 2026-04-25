# Why OC Pledge exists

> The short answer: **the open web has no sovereign primitive for forward-looking, bond-backed, machine-verifiable commitments.** Every existing system that solves a piece of this — escrow agents, notaries, SLA contracts, preregistration registries, prediction markets, on-chain attestations — embeds a custodian, an issuer, an arbiter, or a token economy that defeats sovereignty. Pledge fills the gap by composing the five primitives the OrangeCheck family already ships.

## The gap

Zoom out to the question every web-scale "future-promise" system is currently flunking:

> "I swear I will do X by time T. Bonded by my Bitcoin stake. Verifiable by anyone, anywhere, without trusting a registrar, an arbiter, or a token contract."

The other five primitives cover **present-state declarations**: am, whisper, decide, declare, delegate. None projects commitment forward. Pledge is the **swear** verb — the sixth and final primitive in the family.

| System                        | Forward commitment | Bitcoin-bonded | No custody | Machine-resolvable | Sovereign (no issuer) | Offline-verifiable |
|-------------------------------|:------------------:|:--------------:|:----------:|:------------------:|:---------------------:|:------------------:|
| Snapshot / Helios voting       | ✗                  | ✗              | ✓          | ~                  | ~                     | ~                  |
| Escrow / multi-sig (BIP-65 HTLC)| ✓                 | ✓              | ✗ (custody)| ✓                  | ~                     | ✓                  |
| EAS attestations (Ethereum)    | ✓                  | ✗              | ~          | ✓                  | ✗ (token-gated)       | ✗ (RPC needed)     |
| Kleros / arbitration courts    | ✓                  | ✗              | ✗          | ~                  | ✗                     | ✗                  |
| OSF preregistration            | ✓                  | ✗              | ✓          | ✗ (free-text)      | ✗ (registrar)         | ✗                  |
| GitHub release SLA / npm OWN   | ✓                  | ✗              | ✓          | ~                  | ✗                     | ✗                  |
| C2PA Content Credentials       | ✗                  | ✗              | ✓          | ~                  | ✗ (CA)                | ~                  |
| **OC Pledge**                  | ✓                  | ✓ (OC bond)    | ✓          | ✓ (7 mechanisms)   | ✓ (BIP-322 only)      | ✓                  |

The seven columns are not aesthetics. They are architectural load-bearing properties. Forward commitment is the verb itself. Bitcoin bonding is the only credibly-neutral economic stake on the open internet. No-custody is the line between sovereignty and intermediation. Machine-resolvability is what distinguishes a pledge from a free-text "trust me." Sovereignty is the absence of an issuer. Offline-verifiability is what kills vendor lock-in for good.

## Load-bearing hypotheses

Each hypothesis is a claim the design relies on. We state it, we try to break it, we record the verdict.

### H1. Bitcoin's `sats × days` is the only credibly-neutral stake oracle on the open internet

**Claim.** A pledge needs a bond with teeth. Teeth without custody requires a public economic signal: something that costs the swearer real opportunity cost to maintain, observable to any verifier without permission. OrangeCheck's `sats_bonded × days_unspent` is the only such signal in production today. Ed25519 keys have no economic layer. Token-gated systems (EAS, the Ethereum attestation ecosystem) introduce an issuer. Shoehorning fiat balances requires KYC.

**Adversarial test.** What if Bitcoin's price collapses and the bond becomes economically trivial? The bond is denominated in sats, not dollars. The swearer's commitment is "I won't move this UTXO" — which is a real cost regardless of the exchange rate. A verifier who cares about dollar-denominated stake can compute it themselves; the protocol doesn't take a position.

**Verdict. KEPT.** The Bitcoin-load-bearing leg #1.

### H2. Bitcoin block headers are the only non-malleable time primitive available to the open web

**Claim.** Resolution deadlines need a neutral clock. Wall-clock UTC is fine for human use but fails when the clock-keeper is the swearer (or the resolver). Bitcoin block headers are public, monotonic, and produced by adversarial consensus. A pledge that resolves at block N has a deadline no one can manipulate without rewriting the chain. L2s and altcoins introduce operator trust or reorg risk over long horizons.

**Adversarial test.** What about clients that only have a wall clock? They use `time:` in `resolves_at` and accept the swearer's clock as the deadline. This is a weaker guarantee, suitable for short-horizon pledges, and the spec exposes both forms (§3.1) so the swearer can choose.

**Verdict. KEPT.** The Bitcoin-load-bearing leg #2.

### H3. Resolution must be a pure function of public state, or it does not belong in this protocol

**Claim.** Free-text "trust me" propositions, signed-but-unverifiable promises, and any mechanism that requires consulting a private oracle are out of scope. The seven mechanisms in §3.4 are the exhaustive set: each produces a deterministic boolean given fixed public state. Anything else degrades to a notary-substitute or a token-gated registry.

**Adversarial test.** Doesn't this exclude many real-world pledges? Yes — and that exclusion is the point. A pledge whose truth requires the swearer's word to verify is not a pledge in this protocol. It might be a contract, a marketing claim, or a private commitment. Those have venues. This protocol is for the proper subset whose outcome is computable from public state.

**Verdict. KEPT.** The architectural commitment that cleaves Pledge from notary-substitutes.

### H4. Seven mechanisms is the right count: more invites schism, fewer leaves real use cases on the floor

**Claim.** The seven mechanisms — `chain_state`, `counterparty_signs`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`, `vote_resolves` — together cover preregistration, SLA, delivery, public-statement-by-deadline, domain-control, chain-state-by-block-height, and community-judged commitments. Adding more (oracle-feed, IPFS-CID-published, etc.) creates implementation drift; subtracting any leaves a real category unaddressed.

**Adversarial test.** What if a real use case emerges that needs an eighth mechanism? REGISTRY.md governs extensions. v0.1 ships the seven that cover the categories named in the brief; new mechanisms are added by PR with working integrator code, never by speculation.

**Verdict. KEPT for v0.1.** REGISTRY.md is the extension surface.

### H5. The bond is a commitment, not custody — and slashing is a category error

**Claim.** A bond is the swearer's public economic stake. Its enforcement is **public exposure**: a broken pledge attached to an address is permanent in the public ledger, and the bond signal is what makes that record meaningful. Slashing — the protocol seizing bonded sats on breach — is a different design. It requires custody (HTLC, covenant, multisig with a third party) and turns the protocol into an arbiter. We refuse that turn.

**Adversarial test.** Doesn't this make the bond toothless? No — it makes the bond a **signal**, not a punishment. A swearer with a 5M-sat bond carries more weight than one with a 50K-sat bond. A swearer with a long history of kept pledges and an active bond is differently-credible from one with broken pledges. The "teeth" are the public ledger plus the verifier's free choice to believe or not. That's how the open web has always worked.

**Verdict. KEPT.** Refused: slashing-via-HTLC.

### H6. Raw metrics over aggregated scores — the protocol ships no canonical reputation function

**Claim.** Three raw-query primitives are exposed (`pledges_sworn`, `outcomes_for`, `bond_in_flight`). No aggregated score, no comparable ranking, no cross-address rollup. Any score embeds policy: how to weight recency vs. count, how to handle expired_unresolved, how to weight by bond size. Any shipped score becomes a canonical mis-use surface. OrangeCheck made the same call with `sats_bonded`/`days_unspent` vs. `score_v0`; Pledge inherits the discipline.

**Adversarial test.** Won't every consumer roll their own score? Yes — and that's correct. The protocol ships the raw evidence; consumers ship the policy. A DAO scoring contributors weights differently from a marketplace scoring sellers. Refusing a canonical score is refusing to embed one DAO's policy in everyone's lookup.

**Verdict. KEPT.** Refused: aggregated reputation score in the spec.

### H7. There is no slashing primitive — period

**Claim.** Slashing requires the protocol to either hold the sats (custody) or write to the chain (covenant). Either path makes the protocol an actor with state, breaks offline-verifiability, and adds a censorship surface. The bond is a commitment signal; the consequence of breaking is the public record, full stop.

**Adversarial test.** What about HTLC-based bonds where breach unlocks a payment to a counterparty? That's a separate composition; build it on top of Lightning if you want. It is not Pledge. Pledge is the universal-public-ledger primitive; HTLC bonds are bilateral economic instruments.

**Verdict. KEPT.** Refused: slashing-via-HTLC, slashing-via-covenant, slashing-via-multisig-arbiter.

### H8. Pledges cannot be revoked — abandonment is the only graceful exit, and it counts as broken

**Claim.** A pledge you can walk back is not a pledge. Allowing revocation creates the obvious race: swearers revoke immediately before foreseeable failure to dodge the `broken` classification. Allowing "honorable abandonment" as a distinct ledger state creates the same race in slow motion. The only escape hatch is `oc-pledge-abandonment/v1`, which counts as `broken` in the ledger. The reason field is informational candor; it does not change the classification.

**Adversarial test.** Doesn't this make pledges harsh? Yes — that's the point. A primitive that lets you take it back is rebrandable; this one isn't. If the swearer wants reversibility, they can phrase the pledge with that escape hatch in the proposition itself ("I will publish X by T unless Y happens"), or they can not pledge.

**Verdict. KEPT.** Refused: revocable pledges, honorable-exit ledger states.

### H9. The dispute mechanism is named at swear time, never trust-ranked

**Claim.** When two parties contradict on a `counterparty_signs` outcome, the dispute is referred to a mechanism the swearer **named in the original pledge**: `vote_resolves` with a specific poll, or `named_oracle` with a specific address. Pledges with `dispute.mechanism: null` time out to `expired_unresolved` on contradiction. There is no trust-ranking layer that chooses an arbiter post-hoc.

**Adversarial test.** What about Kleros-style juror selection or game-theoretic incentive markets? They produce excellent arbitration in their domains. They are also a separate trust layer with its own token economics; embedding any specific one in the protocol picks a winner. The protocol exposes the hook (`dispute.mechanism`) and lets the swearer pick.

**Verdict. KEPT.** Refused: trust-ranked dispute mechanism in the protocol.

### H10. No pledge chains in v0.1

**Claim.** A pledge whose outcome is the predicate of another pledge ("if pledge A resolves kept, I pledge B") is composable in principle. v0.1 ships a flat state machine: each pledge's outcome is a pure function of public state, not of another pledge's state. Composition can layer on top.

**Adversarial test.** Doesn't this exclude conditional commitments? It excludes them from the v0.1 protocol surface. They compose at the application layer: a service can swear pledge B only after observing pledge A's outcome. The state machines remain independent; the policy lives in the consumer.

**Verdict. KEPT for v0.1.** Pledge chains are deferred.

### H11. Bilateral pledges resolve through bilateral signatures, not bilateral negotiations

**Claim.** A `counterparty_signs` pledge requires the named counterparty to sign an outcome envelope. Counterparty negotiation, dispute, and final adjudication happen out-of-band (SECURITY.md attack scenarios, OC Lock for confidentiality). The on-protocol artifact is two BIP-322 signatures or a single one with the other party's silence. Adding negotiation primitives to the protocol invites contract-language sprawl.

**Adversarial test.** What about partial fulfillment? A 99.5% SLA when 99.9% was promised? The counterparty signs `broken` (or doesn't sign at all). Partial-fulfillment math is an application-layer concern, not a protocol concern.

**Verdict. KEPT.** Refused: in-protocol negotiation, partial-fulfillment math.

### H12. Identity attribution is by Bitcoin address, even for agent-signed pledges

**Claim.** When an agent signs a pledge under an OC Agent delegation, the pledge counts in the **principal's** public ledger. The agent's signature is a delegated authorization; the principal is the swearer of record. This is consistent with how OC Agent treats agent-actions: the principal is the unit of accountability.

**Adversarial test.** What if an agent goes rogue and swears pledges the principal didn't authorize? The delegation has scopes and bond ceilings (§7.3); a rogue agent's pledges fail scope check. A principal who issued an unscoped delegation accepted the risk; the public ledger reflects that.

**Verdict. KEPT.** Refused: agent-attribution as a substitute for principal-attribution.

### H13. The Ed25519 substitution test — does this work without Bitcoin?

**Claim.** Strip BIP-322 (replace with Ed25519). Strip the OrangeCheck bond (replace with a self-declared "I am credible" claim). Strip the chain-state mechanism (replace with anchor-free wall clocks). What remains? A signed JSON blob with a free-text proposition and an arbiter. In other words, an x509-like attestation system with a token economy bolted on. Already commoditized, already failing.

**Adversarial test.** Which specific Bitcoin properties are load-bearing?

- **Universal stake oracle.** OrangeCheck's `sats × days` is the only credibly-neutral economic signal on the open internet. (H1)
- **Non-malleable time.** Bitcoin block headers are the only adversarial-consensus clock available to clients without operator trust. (H2)
- **Universal address namespace.** Bitcoin addresses are globally enumerable with no registrar. The public ledger of pledges attaches to addresses; pseudonymous Ed25519 keys have no economic or temporal grounding to attach the ledger to. (H1, H2)

Strip any of the three and the system degrades to a known, commoditized, already-failed design.

**Verdict. KEPT.** All three legs are Bitcoin-load-bearing.

## Design rules that emerge

1. **Resolution is a pure function of public state.** No oracles, no free-text proofs, no arbiters in the critical path.
2. **The bond is a commitment signal, never custody.** Public exposure is the only enforcement.
3. **Pledges are unilaterally permanent.** Abandonment exists; revocation does not.
4. **Identity is the Bitcoin address; aggregations are application-layer policy.**
5. **Three envelope kinds, one transport.** Pledge, outcome, abandonment all flow over Nostr kind-30078 with disjoint d-tag namespaces.
6. **Seven mechanisms, no schism.** Extensions go through REGISTRY.md with working integrator code, not speculation.
7. **Dispute mechanisms are named at swear time.** No post-hoc trust-ranking.
8. **State transitions are pure.** Two verifiers with the same inputs produce the same classification.
9. **Compose with the family, don't extend the protocol.** Stamp, Vote, Agent, Lock, Attest are siblings; reach for them, don't replicate them.
10. **Ship the API before the UI.** The seven mechanisms must be callable from `curl` plus a BIP-322 verifier before any web app renders.

## What v0.1 explicitly does NOT solve

- **Aggregated reputation scores.** Raw queries only. (H6)
- **Slashing-based remediation.** No HTLC, no covenant, no escrow. (H7)
- **Cross-chain or L2 anchors.** Bitcoin mainnet only. (H2)
- **Pledge chains** — pledges referencing other pledges' outcomes as predicates. (H10)
- **Revocation.** Abandonment is the only graceful-exit primitive, and it counts as broken. (H8)
- **Receipt-freeness for vote_resolves disputes.** Inherits OC Vote v1's posture.
- **Free-text "trust me" propositions.** Refused by §3.4 enumeration; explicitly refused as `self_proof` in REGISTRY. (H3)
- **In-protocol negotiation primitives.** Bilateral counterparties negotiate out-of-band; the on-protocol artifact is signatures, not chat logs. (H11)
- **Trust-ranked dispute mechanisms.** The dispute mechanism is named at swear time. (H9)
- **Post-quantum authenticity.** secp256k1 and SHA-256 both have finite lifetimes against sufficiently large quantum computers.

## Why not each incumbent?

### Why not Snapshot / Helios?

These solve voting, not commitment. A pledge is an individual swearer's bond-backed commitment to a future-verifiable proposition; a vote is a group's expression of preference. Pledge composes with OC Vote for `vote_resolves` disputes, but does not replicate the voting primitive. Different verb.

### Why not multi-sig escrow / BIP-65 HTLC?

Custody, custody, custody. Escrow holds the funds; the protocol becomes an actor with state and a censorship surface. HTLC is a fine bilateral economic instrument and composes well with Lightning, but it is not a universal public-ledger primitive. Pledge is the universal public-ledger primitive; HTLC builds on top.

### Why not EAS (Ethereum Attestation Service)?

Token-gated issuance, gas fees per attestation, RPC dependency for verification, governance layer for issuers. Wrong architecture for sovereign primitives. EAS is excellent for the Ethereum ecosystem; OC Pledge is for the open web that isn't a token economy.

### Why not Kleros / on-chain arbitration?

Kleros embeds a specific arbitration-token economy. Excellent in its domain; not credibly neutral over time. OC Pledge exposes `dispute.mechanism` as a hook the swearer chooses, and refuses to bake any specific mechanism into the protocol.

### Why not OSF preregistration?

OSF is an excellent registrar for academic preregistration. It is also a registrar — a custodian of the canonical record, with permission semantics. OC Pledge replaces the registrar with a protocol: the canonical record is the BIP-322-signed envelope plus its outcome, content-addressed and observable to any verifier.

### Why not C2PA / Content Credentials?

C2PA is for content provenance, not future-commitment. It also depends on x509 / a CA chain. Different verb, different trust model.

### Why not "just write a Solidity contract"?

A Solidity contract is custody-by-default (gas-paid state writes), token-economy-anchored (ERC-20 / ERC-721), chain-specific (Ethereum or one of its forks), and requires an RPC for verification. Every property OC Pledge architecturally rejects.

## What we kept from each

- **From OrangeCheck:** the `sats × days` stake oracle and the BIP-322 signing ceremony.
- **From OC Stamp:** the canonical-message + Nostr kind-30078 + BIP-322 + RFC 8785 envelope discipline. Verbatim, line-by-line.
- **From OC Vote:** the offline-tallyable poll primitive used as the dispute mechanism, and the discipline of pure-function tally.
- **From OC Agent:** the delegation primitive that enables agent-signed pledges, and the principal-as-unit-of-accountability rule.
- **From OC Lock:** the envelope-is-transport-agnostic posture and the option for confidential counterparty negotiation.

## Closing note

The five existing primitives cover present-state declarations. Pledge projects commitment forward — and does so without custody, without an arbiter, without a token economy, without a registrar. It produces the raw cryptographic evidence that a reputation system, an SLA dashboard, a preregistration aggregator, or an audit registry would consume as input. It does not become any of those.

> Six verbs of sovereign sociality: am, whisper, decide, declare, delegate, swear.

The family is now complete.

## Acknowledgements

OC Pledge owes its design to the discipline of the five primitives that came before it, and to **Bram Kanstein** for the "Bitcoin as sovereignty substrate" framing that grounds the entire family. The family lineage is documented at [docs.ochk.io](https://docs.ochk.io).
