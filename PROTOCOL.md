# OC Pledge — Protocol walkthrough

This is a narrative companion to [SPEC.md](./SPEC.md). If you want the normative rules, read the spec. If you want to understand *why* and *how*, read this.

## The problem

> "I swear I will do X by time T. I'm bonding it with my Bitcoin stake. Anyone, anywhere, anytime can later check whether I kept my word — without trusting a notary, an arbiter, a registrar, or a token contract. If I broke it, the broken pledge is permanently attached to my Bitcoin address. If I kept it, that's permanent too."

That is the user story OC Pledge serves. It sounds simple. Every adjacent system has failed at one or more of those legs:

- **OSF preregistration** gives you a record of the commitment, but the registrar is the canonical-truth holder, and the resolution is free-text.
- **Multi-sig escrow / HTLC** gives you bond enforcement, but it custodies the funds — the protocol is an actor with state.
- **EAS / Ethereum attestations** give you machine-readable attestations, but the issuer is token-gated and verification needs an RPC.
- **Kleros / arbitration courts** give you dispute resolution, but they embed a specific token economy and an arbiter.
- **GitHub release SLAs / npm OWNERS** give you a soft commitment, but no economic stake and no machine-verifiable resolution.
- **Snapshot / Helios voting** solves a different verb (group preference, not individual commitment).

OC Pledge makes the boring choice: **bond your stake with the OrangeCheck attestation you already have, sign a canonical proposition with the Bitcoin wallet you already own, point the resolution at one of seven mechanisms whose outcome is a pure function of public state, and let any verifier classify the result offline forever.**

## The mental model

```
                        sworn_at                          resolves_at
   ┌─────────┐           │                                     │
   │ Wallet  │ BIP-322   │  ┌───────────────────┐              │
   │ (UniSat,│──sign────▶│  │  pledge envelope  │  publish     │
   │ Xverse, │           │  │  (canonical JSON) │ ─────────────┼─▶  Nostr
   │ Sparrow,│           │  └─────────┬─────────┘  d-tag       │  kind-30078
   │ Leather)│           │            │            oc-pledge:* │  oc-pledge:<id>
   └─────────┘           │            │                        │
                         │            │                        │
                         │            ▼                        │
                         │  ┌───────────────────┐              │
                         │  │ public ledger     │              │
                         │  │ (Nostr + chain    │              │
                         │  │  + HTTP + DNS +   │              │
                         │  │  Stamp + Vote)    │              │
                         │  └─────────┬─────────┘              │
                         │            │                        │
                         │  resolution.mechanism is a          │
                         │  pure function of public state      │
                         │            │                        │
                         │            ▼                        │
                         │  ┌───────────────────┐              │
                         │  │ outcome envelope  │   d-tag      │
                         │  │ (kept | broken |  │ ─────────────┼─▶ Nostr
                         │  │  expired_unresolv │ oc-pledge-   │ oc-pledge-outcome:<id>
                         │  │  | disputed)      │ outcome:*    │
                         │  └─────────┬─────────┘              │
                         │            │                        │
                         │            ▼                        │
                         │   public ledger row attached        │
                         │   to swearer.address                │
                         │   queryable by anyone, forever      │
                         └─────────────────────────────────────┘

  Three envelope kinds. Three d-tag namespaces. One Nostr kind (30078).
  Pledge is signed by swearer (or agent under delegation).
  Outcome is signed by counterparty (counterparty_signs / vote_resolves)
       or unsigned-and-deterministic (chain_state, http_get_hash, etc.).
  Abandonment is signed by swearer; counts as broken.
  No custody. No arbiter. No registrar. No token.
```

A pledge is **one signing ceremony**. After that the envelope is self-contained: it carries the canonical message, the BIP-322 signature, the bond reference, and the resolution mechanism. Anyone with a Bitcoin node and a BIP-322 verifier can classify the state at any future time.

## Flow 1 — Alice preregisters a research finding (chain_state + stamp_published)

This is the marquee composition: a researcher commits to the **content** of a future preprint without revealing it ahead of time, then publishes the preprint as an OC Stamp at the deadline.

### Alice swears

1. Alice has 750,000 sats sitting in a single UTXO at `bc1qalice…`, attested via OrangeCheck attestation `0x111…111` for 90 days unspent.
2. Alice has a draft preprint, content_hash `sha256:e3b0c4…`, that she does NOT want to release until peer review is done. But she wants to commit publicly to the exact bytes she'll publish.
3. Alice's client builds the canonical message:
   ```
   oc-pledge/v1
   swearer: bc1qalice…
   proposition: I will publish a research preprint with content_hash sha256:e3b0c4… before 2026-09-01.
   resolution:
     mechanism: stamp_published
     query: stamp(content_hash=sha256:e3b0c4…, signer=bc1qalice…)
   resolves_at:
     time: 2026-09-01T00:00:00Z
   expires_at: 2026-09-08T00:00:00Z
   bond:
     attestation_id: 0x111…111
     min_sats: 500000
     min_days: 60
   counterparty: null
   dispute:
     mechanism: null
     params: null
   remediation: breach_recorded
   sworn_at: 2026-04-24T18:30:00Z
   nonce: 0123456789abcdef0123456789abcdef
   ```
4. Alice signs it with BIP-322 in her wallet — one click, one prompt, the proposition is human-legible in the signing UI.
5. Her client computes `pledge_id = sha256(canonical_message)` and assembles the envelope. She publishes to Nostr kind-30078 with d-tag `oc-pledge:<pledge_id>`.

The pledge is now public. Anyone querying `oc-pledge:<pledge_id>` on a relay sees:
- Alice committed to publishing exactly `sha256:e3b0c4…` before 2026-09-01.
- Alice's bond is attestation `0x111…111`, min 500K sats × 60 days unspent.
- The pledge is `pending` until either (a) a matching stamp is published or (b) `expires_at` passes.

### Alice keeps her word

On 2026-08-15, Alice's preprint is ready. Her client:

1. Computes the SHA-256 of the published bytes — confirms it matches the pre-committed hash.
2. Runs the OC Stamp signing flow ([oc-stamp-protocol](https://github.com/orangecheck/oc-stamp-protocol)) to produce a stamp envelope at `signed_at: 2026-08-15T10:00:00Z`.
3. Publishes the stamp envelope to Nostr kind-30084 with d-tag `oc-stamp:<stamp_id>`.

The pledge is now mechanically resolvable. **Any verifier** with a Bitcoin node and Nostr access can classify it without consulting Alice or any registrar:

```
verifyOutcome(pledge):
  matches = nostr.query(kind=30084, addr=bc1qalice…, hash=sha256:e3b0c4…)
  if any(m.signed_at < pledge.resolves_at and stamp.verify(m)):
    return outcome=kept, witness={ stamp_id: m.id, nostr_event_id: ... }
```

A verifier publishes the deterministic outcome envelope:

```
oc-pledge-outcome/v1
pledge_id: <Alice's pledge id>
outcome: kept
resolved_at: 2026-09-01T01:00:00Z
resolved_by: deterministic
evidence:
  mechanism: stamp_published
  result: stamp_id=<Alice's stamp id>
  witness: nostr_event_id=<Alice's stamp Nostr event>
dispute_window_ends_at: 2026-09-08T01:00:00Z
```

No signature needed — anyone with the same public state computes the same envelope. The pledge is `kept` in Alice's public ledger. Forever.

### Bob looks up Alice's history three years later

A grant committee in 2029 wants to know: how many forward commitments has Alice made, and how many did she keep? Bob queries:

```
nostr.query(kind=30078, "#d-prefix": "oc-pledge:") AND envelope.swearer.address == bc1qalice…
```

He gets every pledge Alice has sworn. He cross-references with `oc-pledge-outcome:*` events for each. He computes his own statistic — kept-rate, average bond, longest-deadline — using whatever policy his committee has agreed on. **The protocol shipped no canonical score**; Bob's committee owns the policy.

## Flow 2 — A SLA pledge between two service providers (counterparty_signs)

A platform provider commits to 99.9% uptime to a customer. The customer is the named counterparty.

### Provider Carol swears

```
oc-pledge/v1
swearer: bc1qcarol…
proposition: I will deliver service-level uptime of at least 99.9 percent to bc1qcounter… during the window 2026-05-01 to 2026-06-01.
resolution:
  mechanism: counterparty_signs
  query: counterparty(bc1qcounter…) signs outcome over pledge_id
resolves_at:
  time: 2026-06-01T00:00:00Z
expires_at: 2026-06-15T00:00:00Z
bond:
  attestation_id: 0x333…333
  min_sats: 2500000
  min_days: 365
counterparty: bc1qcounter…
dispute:
  mechanism: vote_resolves
  params: poll_id=11111…;option=kept;threshold=0.5
remediation: breach_recorded
sworn_at: 2026-04-20T09:00:00Z
nonce: fedcba9876543210fedcba9876543210
```

Carol bonds 2.5M sats × 365 days unspent. The pledge is bilateral: only the named counterparty can sign the kept/broken outcome. Carol pre-named a `vote_resolves` dispute mechanism (a maintainer council poll) in case the counterparty publishes a contradictory or absent outcome.

### The counterparty signs (kept path)

On 2026-06-02, the counterparty's ops team confirms Carol delivered. They publish:

```
oc-pledge-outcome/v1
pledge_id: <Carol's pledge id>
outcome: kept
resolved_at: 2026-06-02T10:00:00Z
resolved_by: bc1qcounter…
evidence:
  mechanism: counterparty_signs
  result: kept
  witness: counterparty_sig=H1+...base64BIP322signature==
dispute_window_ends_at: 2026-06-09T10:00:00Z

sig: { alg: bip322, pubkey: bc1qcounter…, value: <BIP-322 over outcome_id> }
```

The signature is required because the mechanism is non-deterministic — only the named counterparty's word counts. Carol's pledge resolves `kept` after the dispute window passes.

### The counterparty disputes (broken path)

Alternatively, on 2026-06-03 the counterparty publishes:

```
outcome: broken
witness: counterparty_sig=H2+...different signature==
```

If only the counterparty publishes, the pledge resolves `broken` (since they are the named resolver). If Carol counter-publishes a kept outcome, both signatures from authorized parties contradict — the state is `disputed`. The pre-named `vote_resolves` dispute mechanism kicks in: the maintainers council poll resolves the question, and its tally function determines the final ledger state.

If `dispute.mechanism` had been `null`, the contradiction would time out to `expired_unresolved` at `expires_at`.

### Carol's bond

Carol's bond does not move during any of this. The counterparty cannot seize it. The protocol cannot seize it. If Carol breaks, the broken-pledge record attaches to her address; if she keeps, the kept-pledge record attaches. The 2.5M-sat × 365-day signal is the **commitment**, and the verifier's free choice to weight that record is the only "consequence."

## Flow 3 — Open-source delivery commitment (http_get_hash)

A maintainer commits to publishing a release tarball at a canonical URL by a deadline.

### Dave swears

```
oc-pledge/v1
swearer: bc1qdave…
proposition: I will publish the v1.0 release tarball at the canonical URL with sha256:abc123… by 2026-07-15.
resolution:
  mechanism: http_get_hash
  query: GET https://example.org/release/v1.0.tar.gz body_sha256 == abc1230000000000000000000000000000000000000000000000000000000000
resolves_at:
  time: 2026-07-15T00:00:00Z
expires_at: 2026-07-22T00:00:00Z
bond:
  attestation_id: 0x444…444
  min_sats: 750000
  min_days: 60
counterparty: null
dispute:
  mechanism: null
  params: null
remediation: breach_recorded
sworn_at: 2026-04-15T10:00:00Z
nonce: 00112233445566778899aabbccddeeff
```

The query is deterministic: any verifier `curl`s the URL, hashes the body, compares. If the hash matches at or before `resolves_at`, the outcome is `kept` (deterministic; no signature). If the URL 404s or hashes wrong, the outcome is `broken`.

### A verifier checks at deadline

On 2026-07-15T00:01:00Z, anyone can run:

```
curl -L --max-redirs 5 --max-time 30 \
  -H "User-Agent: oc-pledge/0.1" \
  https://example.org/release/v1.0.tar.gz \
  | sha256sum
```

If the result equals `abc1230000…`, the verifier publishes:

```
oc-pledge-outcome/v1
pledge_id: <Dave's pledge id>
outcome: kept
resolved_at: 2026-07-15T00:01:00Z
resolved_by: deterministic
evidence:
  mechanism: http_get_hash
  result: expected=abc123… actual=abc123…
  witness: http_response_hash=abc123…
dispute_window_ends_at: 2026-07-22T00:01:00Z
```

No signature. Multiple verifiers can publish the same envelope; they will all be byte-identical because the mechanism is deterministic. If two verifiers disagree (network conditions, geo-restricted URL), the protocol resolves in favor of the **majority** across at least three independent verifications (SPEC §3.4.5).

### What if Dave's URL goes down on the deadline?

The verifier observes a 404 (or timeout). The deterministic outcome is `broken`:

```
outcome: broken
evidence:
  result: expected=abc123… actual=404_not_found
  witness: http_response_hash=0000000000000000000000000000000000000000000000000000000000000000
```

Dave's broken pledge is now attached to `bc1qdave…` in the public ledger. He cannot revoke it. He could publish an abandonment envelope before the deadline (counts as broken — same ledger state, more candor), but he cannot retroactively unsay the pledge.

## Flow 4 — Agent-signed pledge under OC Agent delegation

A principal delegates `pledge:create` scope to an automated agent that swears pledges on the principal's behalf.

### The principal grants delegation

Per [OC Agent v1 SPEC](https://github.com/orangecheck/oc-agent-protocol), the principal `bc1qprincipal…` issues a delegation:

```
oc-agent:delegation:v1
principal: bc1qprincipal…
agent: bc1qagent…
scopes: pledge:create(max_bond_sats=2000000,mechanism=chain_state)
bond_sats: 0
bond_attestation: none
issued_at: 2026-04-22T12:00:00Z
expires_at: 2027-04-22T12:00:00Z
nonce: 0123456789abcdef0123456789abcdef
```

The delegation id is `36d79600191db871baa3fc9aa3b5e77750a5c423b1f620ec26cf16bd122e19a7`. The agent is now authorized to sign pledges on the principal's behalf, capped at 2M sats bond, restricted to `chain_state` resolution.

### The agent swears a pledge

```
oc-pledge/v1
swearer: bc1qprincipal…
proposition: I (via my agent) will not spend the bonded UTXO before block 925000.
resolution:
  mechanism: chain_state
  query: address(bc1qprincipal…).balance >= 1000000 AT block(925000)
resolves_at:
  block: 925000
expires_at: 2027-01-15T00:00:00Z
bond:
  attestation_id: 0x666…666
  min_sats: 1000000
  min_days: 120
counterparty: null
dispute:
  mechanism: null
  params: null
remediation: breach_recorded
sworn_at: 2026-05-01T16:00:00Z
nonce: cafebabecafebabecafebabecafebabe
```

The envelope additionally carries:

```json
"via_delegation": "36d79600191db871baa3fc9aa3b5e77750a5c423b1f620ec26cf16bd122e19a7",
"agent_address": "bc1qagent…",
"sig": { "pubkey": "bc1qagent…", "value": "<BIP-322 by agent over pledge_id>" }
```

### A verifier checks

The verifier:

1. Reconstructs the pledge canonical message; computes id; matches.
2. Verifies the BIP-322 signature under `bc1qagent…` (the agent address) over the hex pledge id.
3. Resolves the named delegation per OC Agent SPEC §8.1.
4. Confirms `delegation.principal == swearer` (`bc1qprincipal…`) and `delegation.agent == agent_address`.
5. Confirms scope: `pledge:create(max_bond_sats=2000000,mechanism=chain_state)` — pledge bonds 1M sats (≤ 2M ceiling) with mechanism `chain_state`. Pass.
6. Confirms `delegation.expires_at > sworn_at`. Pass.
7. Verifies bond against live chain state.
8. Classifies state per §4.4.

The pledge counts in `bc1qprincipal…`'s public ledger, not the agent's. The agent is an authorized signer; the principal is the swearer of record.

## Flow 5 — Edge case: the counterparty refuses to sign

A common failure mode for `counterparty_signs` pledges. Carol delivers; the counterparty (who maybe didn't actually want to acknowledge it) goes silent.

### What happens

`expires_at` arrives with no outcome envelope from the counterparty. The verifier classifies:

```
state(pledge, outcome=null, abandonment=null, now=expires_at+1, chain) ->
  outcome is null
  abandonment is null
  now >= pledge.expires_at  → expired_unresolved
```

Carol's pledge is `expired_unresolved`. **Not** kept, **not** broken — a distinct third class. Carol's public ledger row reads:

```
pledge_id: <id>  outcome: expired_unresolved  resolved_at: <expires_at + 1>
```

The bond record remains intact. Verifier policies vary:

- A consumer scoring "kept-rate" excludes `expired_unresolved` from the denominator.
- A consumer scoring "follow-through-rate" counts it as a non-completion.
- A consumer rendering Carol's profile shows three separate counts: kept, broken, expired_unresolved.

The protocol ships no canonical answer; the consumer picks. (This is H6 in WHY.md: raw metrics over aggregated scores.)

### Why this is the right default

A unilateral force-default to `broken` would let the counterparty grief Carol by simply ignoring her. A unilateral force-default to `kept` would let Carol grief the counterparty by pre-claiming success. `expired_unresolved` puts the silence on the public record without picking a side. If Carol pre-named a `dispute.mechanism`, that resolves; if not, the stalemate is the ledger entry.

## Compare and contrast

| System                 | Forward commitment | Bond | No custody | Machine-resolvable | Sovereign | Offline-verifiable |
|------------------------|:------------------:|:----:|:----------:|:------------------:|:---------:|:------------------:|
| **OC Pledge**          | ✓                  | ✓ (sats×days) | ✓     | ✓ (7 mechanisms)   | ✓ (BIP-322) | ✓                |
| OSF preregistration    | ✓                  | ✗    | ✓          | ✗ (free-text)      | ✗ (registrar) | ✗              |
| EAS attestations       | ✓                  | ✗    | ~          | ✓                  | ✗ (token-gated) | ✗ (RPC)       |
| Multi-sig escrow / HTLC| ✓                  | ✓    | ✗          | ✓                  | ~         | ✓                  |
| Kleros arbitration     | ✓                  | ~    | ✗          | ~                  | ✗         | ✗                  |
| Snapshot voting        | ✗                  | ✗    | ✓          | ~                  | ~         | ~                  |
| C2PA Content Credentials| ✗                 | ✗    | ✓          | ~                  | ✗ (CA)    | ~                  |
| GitHub release SLA     | ✓                  | ✗    | ✓          | ~                  | ✗         | ✗                  |

Pledge is the only row with all six properties.

## Anti-patterns we rejected

- **Slashing-via-HTLC.** Treating the bond as custody, locking it in a script that releases on breach. This makes the protocol an actor with state, breaks offline-verifiability, and creates a censorship surface. The bond is a commitment signal, not a punishment lever. (WHY §H7)
- **Aggregated reputation score in the spec.** Any score embeds policy. The spec ships raw queries; consumers ship the policy. (WHY §H6)
- **Free-text "trust me" propositions.** The seven mechanisms are the exhaustive set. Pledges with non-deterministic resolution are refused at envelope construction. (WHY §H3)
- **Revocable pledges.** A pledge you can take back is rebrandable. Abandonment is the only graceful exit, and it counts as broken. (WHY §H8)
- **In-protocol dispute trust-ranking.** The dispute mechanism is named at swear time. No post-hoc Kleros-style juror selection in the protocol. (WHY §H9)
- **Pledge chains in v0.1.** A pledge whose outcome is the predicate of another. Composable at the application layer; not in the protocol's flat state machine. (WHY §H10)
- **Cross-chain anchors.** Bitcoin mainnet only. (WHY §H2)
- **Custody of swearer keys.** Never. The wallet the swearer already holds is the identity.

## How this composes with the rest of the OrangeCheck family

- **OrangeCheck Attest** is the bond layer. Every pledge has a `bond` block referencing an OC Attest attestation. (SPEC §2, §8)
- **OC Stamp** is the canonical resolution mechanism for content-publication pledges (`stamp_published`). (SPEC §3.4.4)
- **OC Vote** is the canonical dispute-resolution mechanism (`vote_resolves`). (SPEC §3.4.7, §7.4)
- **OC Agent** is the delegation primitive that lets agents sign pledges on a principal's behalf (`pledge:create` scope). (SPEC §7.3)
- **OC Lock** is the out-of-band tool for confidential counterparty negotiation before swearing publicly. Not a protocol feature; a usage pattern. (SPEC §7.5)

The six verbs — am, whisper, decide, declare, delegate, **swear** — are now complete.

## Live case studies

_Pending: the three reference shapes above will be exercised end-to-end by OC contributors against real OrangeCheck bonds before the v1.0 spec cut. See [`RUNBOOK.md`](./RUNBOOK.md) for the dogfood sequence._

Once each pledge is published, the case-study row below is filled in with the live `pledge.ochk.io/p/<id>` URL, the swearer address, and the eventual outcome envelope id (where applicable).

| Shape | Mechanism | Pledge URL | Outcome |
|---|---|---|---|
| Research preregistration | `stamp_published` | _pending_ | _pending_ |
| Bilateral SLA | `counterparty_signs` + `vote_resolves` dispute | _pending_ | _pending_ |
| Open-source delivery | `http_get_hash` | _pending_ | _pending_ |

Until this table has live entries, the homepage at ochk.io continues to show OC Pledge with the `preview` status pill and the SPEC stays at `Status: Draft (v0.1.0-alpha)`. This is deliberate — see RUNBOOK.md's "Why this is a real gate, not a checkbox" closing note.

## Where to go next

- Read [SPEC.md](./SPEC.md) for normative encoding rules.
- Read [WHY.md](./WHY.md) for the design rationale and the explicit refusals.
- Read [SECURITY.md](./SECURITY.md) for the threat model and attack scenarios.
- Read [REGISTRY.md](./REGISTRY.md) for the resolution-mechanism extension governance.
- Read [NIP_ORANGECHECK_PLEDGE.md](./NIP_ORANGECHECK_PLEDGE.md) for the Nostr wire format.
- Read [RUNBOOK.md](./RUNBOOK.md) for the dogfood publish sequence (eat-your-own-dogfood gate before v1.0).
- Try the examples in [`examples/`](./examples/).
- See conformance fixtures in [`test-vectors/`](./test-vectors/).
