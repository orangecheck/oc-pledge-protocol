# NIP-XX: OC Pledge — Bitcoin-bonded forward commitments on Nostr

`draft` `optional`

> **Status.** Implementer-ready draft. Planned as a formal NIP proposal to `nostr-protocol/nips` once two or more independent implementations interoperate.

---

## Abstract

This NIP defines how to publish and discover **OC Pledge envelopes** over Nostr. A pledge is a cryptographically signed forward commitment to a future-verifiable proposition, bonded by a Bitcoin stake (referenced via an [OrangeCheck](https://docs.ochk.io/attest) attestation), and resolved by one of seven deterministic mechanisms over public state. Three envelope kinds — pledge, outcome, abandonment — share a single Nostr event kind (30078) with disjoint d-tag namespaces.

Full protocol details live in **[SPEC.md](./SPEC.md)**. This NIP covers only the Nostr wire format.

---

## Motivation

Every open protocol shares one problem: how do you make a sovereign, machine-verifiable forward commitment without a custodian, an arbiter, or a token economy? A pledge — sworn with the BIP-322 signature of a Bitcoin address, bonded by sats × days unspent, resolved by chain state or named public artifact — is the answer. Nostr is the natural transport: addressable, replaceable, and already used by every other OrangeCheck-family primitive.

OC Pledge attaches forward commitments to Bitcoin addresses as a public ledger that any verifier can query without permission, without an account, and without trusting the publisher.

---

## Specification

### Event Kind

All three pledge envelope kinds use **kind `30078`** — NIP-78 "application-specific data" (parameterised replaceable). They are distinguished by their `d` tag namespace.

### Three d-tag namespaces

| Envelope | `d` tag form | Purpose |
|---|---|---|
| Pledge | `oc-pledge:<pledge_id>` | The original swearer-signed commitment. |
| Outcome | `oc-pledge-outcome:<pledge_id>` | The kept / broken / expired_unresolved / disputed resolution. |
| Abandonment | `oc-pledge-abandonment:<pledge_id>` | The swearer's pre-deadline admission of failure. Counts as broken. |

`<pledge_id>` is the lowercase 64-hex SHA-256 of the pledge canonical message (SPEC §3.2). The same id appears in all three envelope types — outcome and abandonment envelopes reference the original pledge id.

### Pledge event structure

```json
{
  "kind": 30078,
  "tags": [
    ["d",            "oc-pledge:<pledge_id>"],
    ["addr",         "<swearer_btc_address>"],
    ["mechanism",    "<resolution.mechanism>"],
    ["resolves_at",  "<iso8601 | block:<N>>"],
    ["expires_at",   "<iso8601>"],
    ["bond",         "<bond.attestation_id>"],
    ["counterparty", "<counterparty_address_or_omitted>"]
  ],
  "content":    "<canonical JSON of the pledge envelope>",
  "pubkey":     "<ephemeral or service Nostr pubkey>",
  "created_at": <unix_seconds>,
  "sig":        "<NIP-01 Schnorr signature>"
}
```

### Outcome event structure

```json
{
  "kind": 30078,
  "tags": [
    ["d",                    "oc-pledge-outcome:<pledge_id>"],
    ["pledge",               "<pledge_id>"],
    ["outcome",              "kept | broken | expired_unresolved | disputed"],
    ["resolved_by",          "<btc_address | deterministic>"],
    ["dispute_window_ends",  "<iso8601>"]
  ],
  "content":    "<canonical JSON of the outcome envelope>",
  "pubkey":     "<ephemeral or resolver Nostr pubkey>",
  "created_at": <unix_seconds>,
  "sig":        "<NIP-01 Schnorr signature>"
}
```

### Abandonment event structure

```json
{
  "kind": 30078,
  "tags": [
    ["d",             "oc-pledge-abandonment:<pledge_id>"],
    ["pledge",        "<pledge_id>"],
    ["addr",          "<swearer_btc_address>"],
    ["abandoned_at",  "<iso8601>"]
  ],
  "content":    "<canonical JSON of the abandonment envelope>",
  "pubkey":     "<ephemeral or service Nostr pubkey>",
  "created_at": <unix_seconds>,
  "sig":        "<NIP-01 Schnorr signature>"
}
```

### Tag definitions

| Tag | Required | Value | Purpose |
|---|---|---|---|
| `d` | yes | One of the three d-tag forms above. | Parameterised-replaceable identifier; required by NIP-01. |
| `addr` | yes (pledge, abandonment) | Bitcoin address of swearer. | Discovery by swearer. |
| `pledge` | yes (outcome, abandonment) | 64-hex pledge id. | Cross-link from outcome / abandonment back to pledge. |
| `mechanism` | yes (pledge) | One of the seven values in SPEC §3.4. | Discovery by mechanism. |
| `resolves_at` | yes (pledge) | ISO 8601 UTC, OR `block:<N>` for block-height pledges. | Discovery by deadline. |
| `expires_at` | yes (pledge) | ISO 8601 UTC. | Discovery by expiration. |
| `bond` | yes (pledge) | 64-hex OrangeCheck attestation id. | Discovery by bond. |
| `counterparty` | optional (pledge) | Bitcoin address of counterparty. | Discovery by counterparty. Omit if `null`. |
| `outcome` | yes (outcome) | `kept`, `broken`, `expired_unresolved`, `disputed`. | Discovery by outcome class. |
| `resolved_by` | yes (outcome) | Bitcoin address or `deterministic`. | Discovery by resolver. |
| `dispute_window_ends` | yes (outcome) | ISO 8601 UTC. | Allows clients to filter outcomes whose dispute window has closed. |
| `abandoned_at` | yes (abandonment) | ISO 8601 UTC. | Discovery by abandonment time. |

### Required invariants

1. The event `content` MUST be the byte-canonical JSON of the corresponding envelope (SPEC §6, RFC 8785).
2. `sha256(canonical_message)` MUST equal the id within the envelope AND the suffix of the `d` tag (for pledge events; for outcome and abandonment events, the d-tag suffix is the **pledge** id, not the outcome / abandonment id).
3. The envelope's BIP-322 signature MUST verify (per SPEC §3.5, §4.3, §5.3). The Nostr event's NIP-01 signature is independent and is for relay admission only.
4. Outcome and abandonment events MUST reference an existing pledge event's id via the `pledge` tag.
5. Unknown tags MUST be preserved by relays and MAY be ignored by consumers.

### Signing

The Nostr event is signed as usual (NIP-01 Schnorr signature over the event id). Two publishing conventions coexist:

- **Self-signed (rare).** When the swearer also has a Nostr identity bound to their Bitcoin address (e.g., via OrangeCheck), they MAY sign the Nostr event with that npub. This lets consumers cross-reference the Nostr publisher with the BIP-322 swearer.
- **Service-signed (common).** Most pledges are published by the user's client or a directory service using an ephemeral or service Nostr key. Consumers trust the BIP-322 signature inside the envelope; the Nostr signature is for relay admission and replay control only.

For abandonment and outcome envelopes from a counterparty, the same convention applies. The Nostr publisher is not the trust anchor; the BIP-322 signer inside the envelope is.

---

## Discovery

### By swearer address

```json
{ "kinds": [30078], "#addr": ["<btc_address>"] }
```

Returns all pledges (and abandonments) attached to that address. Filter `d` tag prefix `oc-pledge:` for pledges only, `oc-pledge-abandonment:` for abandonments only.

### By pledge id

```json
{ "kinds": [30078], "#d": ["oc-pledge:<pledge_id>"] }
```

Returns the single pledge event. To find its outcome and abandonment:

```json
{ "kinds": [30078], "#pledge": ["<pledge_id>"] }
```

### By mechanism

```json
{ "kinds": [30078], "#mechanism": ["counterparty_signs"] }
```

### By outcome class

```json
{ "kinds": [30078], "#outcome": ["broken"] }
```

### By bond attestation

```json
{ "kinds": [30078], "#bond": ["<attestation_id>"] }
```

Useful for a swearer auditing all pledges currently bonded against a particular UTXO.

### Compound queries

The three raw protocol queries from SPEC §2.6 map to:

- `pledges_sworn(addr)`: `#d-prefix oc-pledge: AND #addr <addr>`
- `outcomes_for(addr)`: `#d-prefix oc-pledge-outcome: AND envelope.swearer.address == <addr>` (clients filter post-fetch)
- `bond_in_flight(addr, at)`: client computes by joining `pledges_sworn(addr)` against `outcomes_for(addr)` at the given time, summing bonds of pledges in `pending` or `resolvable` state.

These are **raw** queries. The protocol explicitly does not ship aggregated reputation or scoring (SPEC §2.6, WHY §H6).

---

## Relay selection

Implementations SHOULD publish each pledge / outcome / abandonment to at least three relays from a diverse set. The reference clients use the OC family default set:

- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`

Verifiers MUST query at least two relays from the default set when resolving `nostr_event_exists` or `stamp_published` mechanisms (SPEC §3.4.3, §3.4.4).

---

## Replaceable behavior

Kind 30078 is **addressable / parameter-replaceable**: relays replace prior events with the same `(pubkey, kind, d-tag)` tuple. For OC Pledge:

- A **pledge** event is content-addressed (`d = oc-pledge:<id>` where id hashes the canonical message). A "replacement" with the same d-tag must carry the same envelope bytes, or fail BIP-322 verification.
- An **outcome** event is namespaced by pledge id (`d = oc-pledge-outcome:<pledge_id>`). The Nostr `(pubkey, kind, d-tag)` tuple means a replacement with the same publisher npub overwrites the prior outcome — useful for deterministic-outcome corrections (e.g., a verifier republishing with a more recent chain hash). For non-deterministic outcomes (`counterparty_signs`), each authorized resolver may publish independently; relays index by pubkey, so two parties' contradictory outcomes are both observable.
- An **abandonment** event has the same shape (`d = oc-pledge-abandonment:<pledge_id>`). A swearer can publish at most one abandonment per pledge; later abandonments from the same publisher overwrite earlier ones at the relay layer.

---

## Composition with other OrangeCheck NIPs

- **OrangeCheck attestations** (kind 30078, d-tag `<attestation_id>`) are referenced in every pledge's `bond` block. A verifier resolves the attestation against live chain state per the OrangeCheck NIP.
- **OC Stamp envelopes** (kind 30084) are referenced by `stamp_published` resolution. A verifier looks up the stamp via OC Stamp's discovery patterns.
- **OC Vote polls** (kinds 30080–30082) are referenced by `vote_resolves` resolution and `vote_resolves` dispute mechanisms. A verifier runs the OC Vote tally function per OC Vote SPEC.
- **OC Agent delegations** (kind 30083) are referenced by `via_delegation` for agent-signed pledges. A verifier resolves the delegation per OC Agent SPEC §8.1.

All five family NIPs share the kind-30078 transport for primary objects (with kinds 30080–30085 carved out for ballots, reveals, agent delegations, stamp envelopes, and agent revocations). The d-tag namespaces are disjoint and clients filter by prefix.

---

## Privacy considerations

- The swearer's Bitcoin address is **plaintext** in every pledge envelope and in the `addr` tag.
- The bond reference is **plaintext** and cross-linkable to the swearer's other OrangeCheck attestations.
- The proposition string is **plaintext** and may leak intent or counterparty identity.
- Counterparty addresses, when present, are **plaintext**.

Swearers who want pseudonymous commitments swear from a fresh Bitcoin address per pledge, at the cost of losing identity continuity. See SECURITY.md §"address linkability" for the architectural discussion.

For confidential **negotiation** of pledge terms before swearing publicly, counterparties MAY use [OC Lock v2](https://github.com/orangecheck/oc-lock-protocol). Once sworn, the pledge is plaintext; Lock plays no role at verification time.

---

## Backward compatibility

OC Pledge v0.1 reuses Nostr kind 30078, the OrangeCheck family transport. A relay or client unaware of OC Pledge will see kind-30078 events with unfamiliar d-tag prefixes and SHOULD preserve them on relay (NIP-01 default behavior). Filtering by `d`-tag prefix isolates each sub-protocol.

---

## Reference

- SPEC: https://github.com/orangecheck/oc-pledge-protocol/blob/main/SPEC.md
- WHY: https://github.com/orangecheck/oc-pledge-protocol/blob/main/WHY.md
- SECURITY: https://github.com/orangecheck/oc-pledge-protocol/blob/main/SECURITY.md
- Family: https://docs.ochk.io
