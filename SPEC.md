# OC Pledge Protocol v1.0 — Specification

**Status:** Stable
**Date:** 2026-05
**Related:** [OrangeCheck](https://docs.ochk.io/attest) (identity + stake), [OC Lock v2](https://github.com/orangecheck/oc-lock-protocol) (private envelopes), [OC Stamp v1](https://github.com/orangecheck/oc-stamp-protocol) (content attestation), [OC Vote v1](https://github.com/orangecheck/oc-vote-protocol) (offline-tallyable polls), [OC Agent v1](https://github.com/orangecheck/oc-agent-protocol) (delegated authority)

---

## 0. Notation

- All bytes serialized as lowercase hex unless marked `base64` or `base64url`.
- `||` denotes byte concatenation.
- `H()` = SHA-256 (RFC 6234).
- `BIP322(addr, msg)` = BIP-322 signature of `msg` by `addr`, encoded as base64.
- Canonical JSON = UTF-8 encoded JSON with lexicographically sorted object keys, no insignificant whitespace, LF-terminated. See §6.
- ISO 8601 UTC means `YYYY-MM-DDTHH:MM:SSZ` (no fractional seconds, no offsets other than `Z`). Implementations MUST reject `+00:00`, `+00`, lowercased `z`, fractional-second forms, and any offset other than the literal capital-`Z` suffix in canonical-message contexts.
- `sats` is an integer count of satoshis (100,000,000 sats = 1 BTC).
- `block(N)` denotes the Bitcoin mainnet block at height `N`.
- "Public state" = (Bitcoin chain headers + Bitcoin chain transactions + named Nostr relays + reachable HTTPS endpoints + DNS-over-HTTPS responses) at the moment of verification.

## 1. Actors

- **Swearer** — the party making a pledge. Holds a Bitcoin address capable of BIP-322 signing. Signs the pledge canonical message. May also sign abandonment envelopes.
- **Counterparty** — optional second party named in a bilateral pledge. Holds a Bitcoin address capable of BIP-322 signing. May sign outcome envelopes when `resolution.mechanism == counterparty_signs`.
- **Resolver** — the party (or pure function) that publishes the outcome envelope. For deterministic mechanisms (`chain_state`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`), the "resolver" is the literal string `deterministic` and any verifier with access to the same public state computes a byte-identical envelope. For `counterparty_signs`, the resolver is the named counterparty. For `vote_resolves`, the resolver is the OC Vote tally function applied to the pre-specified poll.
- **Verifier** — any party reading a pledge plus its outcome envelope to confirm authenticity, evidence, and state-machine classification. Never consults a proprietary endpoint; verification is a pure function of the envelopes plus public state.
- **Directory** — a Nostr relay (or set of relays) that stores published pledge, outcome, and abandonment events for durable public discovery. Optional — envelopes MAY travel out-of-band.
- **Agent** — optional. Under an [OC Agent](https://github.com/orangecheck/oc-agent-protocol) delegation with scope `pledge:create`, an agent MAY sign pledge envelopes on behalf of a principal. The pledge counts in the principal's public ledger, not the agent's. See §7.3.

A swearer MAY be their own counterparty (a self-pledge with bilateral structure used for intent declarations). The protocol places no further constraint on actor relationships.

## 2. Identities

All actors are identified by **mainnet Bitcoin addresses** (P2WPKH, P2TR, or P2PKH). The address is the full identity: there are no usernames, keyservers, or accounts in the protocol.

A pledge MUST include a **bond** referencing an OrangeCheck attestation, with two minimum thresholds: `min_sats` and `min_days`. The reference is **self-declared** and **re-verifiable**: a verifier MUST re-resolve the attestation against current chain state and confirm the bonded UTXOs still meet both thresholds at verification time. The protocol never holds the bonded sats; enforcement is by **public exposure**, not slashing. See §8 for the bond verification algorithm.

The bond is a **commitment, not custody**. A swearer who spends the bonded UTXO before resolution invalidates the bond and the verifier's bond check fails — equivalent to a broken pledge in any verifier's policy that requires a satisfied bond at verification time. No protocol actor can seize the bonded sats. This is a deliberate refusal of slashing-based designs (see WHY §H7).

## 3. The pledge envelope

A **pledge** is a single canonical JSON object referred to by file extension `.pledge` and MIME type `application/vnd.oc-pledge+json`.

### 3.1 Canonical message (swearer-signed)

The swearer's BIP-322 signature commits to this exact byte sequence:

```
oc-pledge/v1
swearer: <btc_address>
proposition: <single-line proposition string>
resolution:
  mechanism: <one of: chain_state | counterparty_signs | nostr_event_exists | stamp_published | http_get_hash | dns_record | vote_resolves>
  query: <single-line canonical query string for the mechanism>
resolves_at:
  time: <ISO 8601 UTC>
  <or>
  block: <non-negative integer, decimal>
expires_at: <ISO 8601 UTC>
bond:
  attestation_id: <64-hex SHA-256 of an OrangeCheck attestation canonical message>
  min_sats: <non-negative integer, decimal>
  min_days: <non-negative integer, decimal>
counterparty: <btc_address | "null">
dispute:
  mechanism: <"null" | "vote_resolves" | "named_oracle">
  params: <single-line canonical params string | "null">
remediation: breach_recorded
sworn_at: <ISO 8601 UTC>
nonce: <16-byte random hex (32 lowercase hex characters)>
```

Each line is terminated by a single LF (`0x0a`). There is no trailing LF after the `nonce` line. The first line is the literal 12-byte string `oc-pledge/v1` — a domain separator that prevents cross-envelope signature replay between this protocol and any other OrangeCheck family envelope.

The `resolves_at` block contains exactly **one** of `time:` or `block:`, not both. Implementations MUST emit the chosen line only. Both forms are permitted by the protocol; verifiers normalize them at the state-machine layer (§4.4).

The `proposition` string is exactly one line: it MUST NOT contain `0x0a` or `0x0d`. Length is bounded at 512 UTF-8 bytes for wallet legibility. The proposition is **informational** to a verifier — the cryptographic truth comes from the `resolution.mechanism` + `resolution.query` pair. The proposition is what the swearer reads in the signing prompt; the query is what the verifier evaluates against public state.

The `resolution.query` string is a single line in the deterministic grammar of the chosen mechanism (§3.4). It MUST NOT contain `0x0a` or `0x0d`. Length is bounded at 1024 UTF-8 bytes.

The `nonce` field is **non-optional**. It is exactly 32 lowercase hex characters (16 random bytes). Empty or missing nonces MUST be rejected at envelope-construction time with error `E_PLEDGE_MALFORMED`. The nonce prevents two identical pledges (same proposition, same swearer, same deadline) from producing the same `pledge_id`.

The literal string `breach_recorded` on the `remediation` line is fixed in v1.0. There is no `slashing` value, no `payout` value, no `escrow_release` value. The remediation is, and only is, that the broken pledge is recorded against the swearer's address in the public ledger. Future versions MAY extend this field through the registry (see [REGISTRY.md](./REGISTRY.md)).

### 3.2 Pledge id

```
pledge_id := H(canonical_message_bytes)
```

`pledge_id` is 32 bytes, serialized in the envelope as 64 lowercase hex characters. This id is:

- The Nostr `d`-tag suffix (§2.8 of NIP_ORANGECHECK_PLEDGE.md): `oc-pledge:<pledge_id>`.
- The reference target for outcome and abandonment envelopes (`outcome.pledge_id`, `abandonment.pledge_id`).
- The message signed by BIP-322 in `sig.value`, expressed as its 64-character lowercase hex string (§3.5).
- The envelope's self-referential identifier, re-derivable from the canonical-message inputs.

Any change to the canonical message — including whitespace, capitalization, line endings, or the choice between `time:` and `block:` — produces a different id. Compliant clients MUST produce byte-identical canonical messages for identical inputs.

### 3.3 Envelope schema

```json
{
  "v": 1,
  "kind": "pledge",
  "id": "<64-hex>",

  "swearer": {
    "address": "bc1q…",
    "alg": "bip322"
  },

  "proposition": "I will publish a research preprint with content_hash sha256:e3b0c4… before 2026-09-01.",

  "resolution": {
    "mechanism": "stamp_published",
    "query": "stamp(content_hash=sha256:e3b0c4…, signer=bc1q…)"
  },

  "resolves_at": { "time": "2026-09-01T00:00:00Z" } | { "block": 920000 },
  "expires_at": "2026-09-08T00:00:00Z",

  "bond": {
    "attestation_id": "<64-hex>",
    "min_sats": 1000000,
    "min_days": 90
  },

  "counterparty": "bc1q…" | null,

  "dispute": {
    "mechanism": "vote_resolves" | "named_oracle" | null,
    "params": "poll_id=…;option=kept;threshold=0.66" | null
  },

  "remediation": "breach_recorded",

  "sworn_at": "2026-04-24T18:30:00Z",
  "nonce": "<32 lowercase hex chars>",

  "via_delegation": "<64-hex OC Agent delegation id>" | undefined,
  "agent_address":  "bc1q…" | undefined,

  "sig": {
    "alg": "bip322",
    "pubkey": "<swearer.address (or agent.address when via_delegation present)>",
    "value": "<base64 BIP-322 signature>"
  }
}
```

### 3.4 The resolution grammar

Fixed at v1.0. Implementations MUST refuse pledges with a mechanism string outside this set with error `E_RESOLUTION_UNKNOWN`. Extensions are governed by [REGISTRY.md](./REGISTRY.md); v1.0 explicitly refuses `self_proof`.

#### 3.4.1 `chain_state`

Queries over Bitcoin mainnet chain state. Grammar (single-line, comma-or-AND-separated atoms):

```
block(<N>).hash.startsWith(<hex_prefix>)
block(<N>).exists
tx(<txid>).confirmed
tx(<txid>).confirmations >= <N>
address(<addr>).balance >= <sats>
address(<addr>).balance < <sats>
address(<addr>).utxo_count == <N>
address(<addr>).balance >= <sats> AT block(<N>)
```

`AT block(<N>)` pins the predicate to a specific block height; without it, the query is evaluated at the verifier's chain tip. Predicates MAY be combined with the literal token ` AND ` (one space on each side). Implementations execute these against any public Bitcoin RPC; outputs MUST be byte-identical across implementations for identical chain state.

#### 3.4.2 `counterparty_signs`

Resolution requires a BIP-322 signature from the named `counterparty` over an outcome envelope declaring `kept` or `broken`. The pledge MUST have a non-null `counterparty`. The query string SHOULD be the literal:

```
counterparty(<counterparty_addr>) signs outcome over pledge_id
```

If the counterparty does not sign within `expires_at`, the pledge enters state `expired_unresolved` (§4.4) and counts as neither kept nor broken in the public ledger.

#### 3.4.3 `nostr_event_exists`

Queries the form:

```
kind=<N> author=<npub_or_hex> tag(<name>)=<value> created_at_before=<ISO 8601 UTC>
```

Implementations MUST query at least two relays from the family default set (see NIP_ORANGECHECK_PLEDGE.md §relays). An event is considered to exist if any queried relay returns it AND its NIP-01 signature validates AND the named tag and timestamp constraint are satisfied.

#### 3.4.4 `stamp_published`

Queries the existence of a specific OC Stamp envelope. Grammar:

```
stamp(content_hash=<sha256:hex>, signer=<addr>)
```

The verifier looks up matching OC Stamp kind-30084 events (per [OC Stamp SPEC §7](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#7-nostr-directory-optional)) and validates each. The pledge resolves `kept` if at least one matching stamp is authentic AND its signed_at predates `pledge.resolves_at`.

#### 3.4.5 `http_get_hash`

Queries an HTTPS endpoint and compares SHA-256 of the response body to an expected value. Grammar:

```
GET <https-url> body_sha256 == <64-hex>
```

Implementations MUST follow at most 5 HTTP redirects, MUST set a 30-second total timeout, MUST send `User-Agent: oc-pledge/0.1`, and MUST verify TLS to a CA root bundle. Disagreements between conforming implementations on transient network conditions are not protocol bugs; pledges resolve in favor of the **majority** classification across at least three independent verifications when contested.

#### 3.4.6 `dns_record`

Queries DNS over HTTPS. Grammar:

```
<TYPE> <name> == <value>
```

Where `TYPE` is one of `A`, `AAAA`, `TXT`, `CAA`, `MX`, `CNAME`. Implementations MUST query at least two of: `https://cloudflare-dns.com/dns-query`, `https://dns.google/resolve`, `https://dns.quad9.net/dns-query`. The record is considered to match iff every queried resolver returns a value byte-identical to `<value>`.

#### 3.4.7 `vote_resolves`

Resolution delegated to an OC Vote poll whose id is named in the query:

```
poll_id=<64-hex> option=<option_id> threshold=<decimal in [0.0, 1.0]>
```

The pledge resolves `kept` iff the OC Vote tally function (per [OC Vote SPEC §7](https://github.com/orangecheck/oc-vote-protocol/blob/main/SPEC.md)) produces a result where the named `option` exceeds `threshold` of weighted votes. Otherwise `broken`.

#### 3.4.8 No `self_proof`

There is no `self_proof` mechanism. A pledge whose truth requires the swearer's own assertion as proof is not in scope for this protocol. Implementations MUST reject such pledges with `E_RESOLUTION_UNKNOWN` or `E_RESOLUTION_NONDETERMINISTIC` if encountered. See WHY §H3 and REGISTRY §Refused.

### 3.5 Signing

The BIP-322 signature commits to the **hex string** of the pledge id (64 ASCII bytes, lowercase):

```
sig.value := BIP322(swearer.address, hex(pledge_id))
```

The hex form (not raw 32 bytes) is used so wallet UIs can display the signed message to the user for confirmation. The pledge id transitively commits to the canonical message, hence every signed field.

When `via_delegation` is present (agent-signed pledge — see §7.3), the signature is produced by the **agent** address rather than the swearer. The verifier additionally resolves the named delegation, confirms its scope set includes `pledge:create` with consistent bond constraints, and confirms `agent.address == sig.pubkey`. The pledge's identity attribution remains the principal (`swearer.address`), not the agent.

### 3.6 Field rules

| Field | Rule |
|---|---|
| `v` | Integer. Current version is `1`. Verifiers MUST reject unknown versions with `E_UNSUPPORTED_VERSION`. |
| `kind` | MUST equal `"pledge"`. |
| `id` | MUST equal `H(canonical_message)` as hex (§3.2). |
| `swearer.address` | MUST match `swearer:` in the canonical message. |
| `swearer.alg` | MUST equal `"bip322"` in v1. |
| `proposition` | MUST equal the canonical message's `proposition:` value. Single line, ≤ 512 UTF-8 bytes. |
| `resolution.mechanism` | MUST be one of the seven values in §3.4. |
| `resolution.query` | MUST match the grammar of the named mechanism. Single line, ≤ 1024 UTF-8 bytes. |
| `resolves_at` | Exactly one of `{time}` or `{block}`. MUST NOT be both. |
| `expires_at` | ISO 8601 UTC. MUST satisfy `expires_at >= resolves_at` when both are time-typed; for `block` resolution, MUST be a valid ISO timestamp at or after the expected wall-clock arrival of the resolves block. |
| `bond.attestation_id` | 64-hex. SHOULD be the SHA-256 of an OrangeCheck attestation canonical message signed by `swearer.address`. |
| `bond.min_sats` | Non-negative integer. |
| `bond.min_days` | Non-negative integer. |
| `counterparty` | Bitcoin address or null. Required non-null when `resolution.mechanism == counterparty_signs`. |
| `dispute.mechanism` | `"null"`, `"vote_resolves"`, or `"named_oracle"`. |
| `dispute.params` | Single-line canonical params string for the dispute mechanism, or null. |
| `remediation` | MUST equal `"breach_recorded"` in v1.0. |
| `sworn_at` | ISO 8601 UTC. The swearer's claim of signing time. Not load-bearing for resolution; the resolution mechanism's witness is. |
| `nonce` | 32 lowercase hex chars. MUST be non-empty. SHOULD be uniformly random. |
| `via_delegation` | Optional 64-hex OC Agent delegation id. If present, `sig` is produced by `agent_address`, and the verifier follows the agent-delegation verification path (§7.3). |
| `agent_address` | Optional Bitcoin address; required iff `via_delegation` is present. |
| `sig.alg` | MUST equal `"bip322"` in v1. |
| `sig.pubkey` | MUST equal `swearer.address` when `via_delegation` is absent; MUST equal `agent_address` when present. |
| `sig.value` | MUST verify under BIP-322 by `sig.pubkey` over the lowercase-hex `pledge_id`. |

### 3.7 Unknown-field tolerance

Verifiers MUST preserve unknown top-level fields when relaying envelopes but MAY ignore them when verifying. Incompatible changes increment `v` (§13).

## 4. The outcome envelope

An **outcome** is a single canonical JSON object that asserts the resolution of a pledge.

### 4.1 Canonical message (resolver-signed or deterministic)

```
oc-pledge-outcome/v1
pledge_id: <64-hex>
outcome: <kept | broken | expired_unresolved | disputed>
resolved_at: <ISO 8601 UTC>
resolved_by: <btc_address | "deterministic">
evidence:
  mechanism: <same mechanism as the referenced pledge>
  result: <single-line canonical result string>
  witness: <single-line canonical witness string>
dispute_window_ends_at: <ISO 8601 UTC>
```

Each line LF-terminated; no trailing LF after `dispute_window_ends_at`. The first line is the literal 20-byte string `oc-pledge-outcome/v1`.

`outcome_id := H(canonical_message_bytes)`.

The `evidence.witness` line is mechanism-specific. Recommended canonical forms:

| Mechanism | `witness` form |
|---|---|
| `chain_state` | `chain_height=<N> chain_hash=<64-hex>` |
| `nostr_event_exists` | `nostr_event_id=<64-hex>` |
| `stamp_published` | `nostr_event_id=<64-hex>` (the OC Stamp envelope's Nostr id) |
| `http_get_hash` | `http_response_hash=<64-hex>` |
| `dns_record` | `dns_response=<single-line canonical answer>` |
| `counterparty_signs` | `counterparty_sig=<base64 BIP-322>` |
| `vote_resolves` | `vote_poll_id=<64-hex>` |

### 4.2 Envelope schema

```json
{
  "v": 1,
  "kind": "pledge-outcome",
  "id": "<64-hex outcome_id>",

  "pledge_id": "<64-hex>",
  "outcome": "kept" | "broken" | "expired_unresolved" | "disputed",
  "resolved_at": "2026-09-01T01:00:00Z",
  "resolved_by": "bc1q…" | "deterministic",

  "evidence": {
    "mechanism": "<same as pledge>",
    "result": "<canonical>",
    "witness": "<canonical>"
  },

  "dispute_window_ends_at": "2026-09-08T01:00:00Z",

  "sig": null | {
    "alg": "bip322",
    "pubkey": "<resolved_by address>",
    "value": "<base64 BIP-322>"
  }
}
```

### 4.3 Signature requirements

| Mechanism | `resolved_by` | `sig` requirement |
|---|---|---|
| `chain_state` | `"deterministic"` | `null`. Signature not required. |
| `nostr_event_exists` | `"deterministic"` | `null`. |
| `stamp_published` | `"deterministic"` | `null`. |
| `http_get_hash` | `"deterministic"` | `null`. |
| `dns_record` | `"deterministic"` | `null`. |
| `counterparty_signs` | `<counterparty.address>` | BIP-322 by counterparty over `outcome_id` (hex). |
| `vote_resolves` | `"deterministic"` | `null`. The OC Vote tally is itself a pure function. |

For deterministic outcomes, **any verifier with access to the same public state computes a byte-identical envelope**. Two verifiers producing different outcome envelopes for the same pledge means at least one is operating on different public state. The protocol resolves this by majority across at least three independent computations for deterministic mechanisms; see §10.

### 4.4 The state machine

A pledge is in exactly one of these states at any moment:

- `pending` — sworn (signature verified, bond verified at `sworn_at`), `now < resolves_at_normalized`.
- `resolvable` — `resolves_at_normalized <= now < expires_at`, no consistent outcome envelope, no abandonment.
- `kept` — outcome envelope present with `outcome == kept`, dispute window passed, no contradictory outcome envelope from a party authorized to dispute.
- `broken` — outcome envelope present with `outcome == broken` AND dispute window passed, OR an abandonment envelope was published before `resolves_at`.
- `disputed` — two or more outcome envelopes from authorized parties with contradictory outcomes, within dispute window OR awaiting dispute mechanism resolution.
- `expired_unresolved` — `now >= expires_at` AND no consistent outcome envelope AND no abandonment AND not disputed-and-resolved.

`resolves_at_normalized` is `resolves_at.time` if `time:` was used, else the wall-clock timestamp of the Bitcoin block at `resolves_at.block` (or, if not yet mined, `+infinity`).

Transition algorithm (pure function of pledge envelope, outcome envelope or absence, abandonment envelope or absence, current time, current chain state):

```
state(pledge, outcome, abandonment, now, chain) :=
  if abandonment is not null and abandonment.signature_valid:
    return broken
  if outcome is not null:
    if outcome.signature_required and not outcome.signature_valid:
      raise E_OUTCOME_BAD_SIG
    if exists contradictory outcome from authorized resolver within dispute window:
      return disputed
    if now < outcome.dispute_window_ends_at:
      return outcome.outcome  # provisional; verifiers may flag as "in window"
    return outcome.outcome   # final
  if now >= pledge.expires_at:
    return expired_unresolved
  if now >= resolves_at_normalized(pledge, chain):
    return resolvable
  return pending
```

Two verifiers with the same inputs MUST produce the same state classification.

### 4.5 Bilateral consistency

When `resolution.mechanism == counterparty_signs`, both swearer and counterparty MAY publish outcome envelopes:

- **Consistent**: both publish `kept` (or both `broken`). The state resolves to that outcome after the dispute window passes (§4.4).
- **Contradictory**: swearer publishes `kept`, counterparty publishes `broken` (or vice versa). The state is `disputed`. If the pledge has `dispute.mechanism != null`, the dispute is referred to that mechanism; otherwise the pledge times out to `expired_unresolved`.

Test vectors `v21-bilateral-consistent.json` and `v22-bilateral-contradictory.json` pin these transitions.

## 5. The abandonment envelope

A swearer may admit an upcoming break by publishing an **abandonment envelope** before `resolves_at`. Abandonment counts as `broken` in the public ledger — strictly equivalent to a resolved broken pledge. There is no honorable-exit ledger state.

### 5.1 Canonical message (swearer-signed)

```
oc-pledge-abandonment/v1
pledge_id: <64-hex>
abandoned_at: <ISO 8601 UTC>
reason: <single-line string, ≤ 280 UTF-8 bytes>
```

Each line LF-terminated; no trailing LF after `reason`. The first line is the literal 24-byte string `oc-pledge-abandonment/v1`.

`abandonment_id := H(canonical_message_bytes)`.

### 5.2 Envelope schema

```json
{
  "v": 1,
  "kind": "pledge-abandonment",
  "id": "<64-hex abandonment_id>",

  "pledge_id": "<64-hex>",
  "abandoned_at": "2026-08-01T12:00:00Z",
  "reason": "single-line informational reason",

  "sig": {
    "alg": "bip322",
    "pubkey": "<swearer.address from the referenced pledge>",
    "value": "<base64 BIP-322>"
  }
}
```

### 5.3 Field rules

| Field | Rule |
|---|---|
| `v` | Integer. `1` in this version. |
| `kind` | MUST equal `"pledge-abandonment"`. |
| `id` | MUST equal `H(canonical_message)` as hex. |
| `pledge_id` | MUST be a known, swearer-signed pledge id. |
| `abandoned_at` | ISO 8601 UTC. MUST satisfy `abandoned_at >= pledge.sworn_at` and SHOULD satisfy `abandoned_at < pledge.resolves_at_normalized` (an abandonment after `resolves_at` is still accepted but is informationally redundant — the outcome envelope path is the canonical way to record post-resolution outcomes). |
| `reason` | Single-line UTF-8 string, ≤ 280 bytes. Informational only; does not change the ledger classification. |
| `sig.pubkey` | MUST equal the original pledge's `swearer.address`. Agents MAY NOT publish abandonments under v1.0; abandonment is principal-only. |
| `sig.value` | MUST verify under BIP-322 over the hex-encoded `abandonment_id`. |

### 5.4 Why no honorable exit

A pressure-tested decision: any ledger state that distinguishes "abandoned honorably" from "broken silently" creates a race condition in which swearers, foreseeing imminent failure, race to abandon and dodge the `broken` classification. The protocol refuses that escape hatch. Abandonment is informational candor — swearers admit publicly rather than hiding — and is recorded as the same outcome class as a broken pledge.

See WHY §H8.

## 6. Canonicalization

The canonical byte representation of an envelope is required for over-the-wire equality, test-vector conformance, and any future operations that need deterministic envelope serialization.

Canonical form (all three envelope kinds):

- UTF-8 JSON with keys sorted lexicographically at every level.
- No insignificant whitespace (no spaces after `:` or `,`, no leading/trailing whitespace).
- Arrays preserve order.
- Numbers serialized with no fractional zeros and no exponents for integers within IEEE 754 double range.
- Strings serialized with `\uXXXX` escapes only for control characters and `"` / `\`; all other codepoints literal.
- Final byte is LF (`0x0a`).

Reference: [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785).

The pledge envelope contains no array field that requires stable per-element sorting. RFC 8785 alone is sufficient. The same applies to outcome and abandonment envelopes.

## 7. Composition with the OrangeCheck family

OC Pledge composes with every other family primitive by design. None of the compositions below are extensions of this protocol — they are usage patterns made trivial by referencing existing specs.

### 7.1 Stake bond via OrangeCheck

The `bond` block in every pledge is an OrangeCheck attestation reference plus minimum thresholds (§2). Verifiers MUST re-resolve via [`@orangecheck/sdk#verify`](https://github.com/orangecheck/oc-attest-protocol) and confirm `sats_bonded >= min_sats AND days_unspent >= min_days` at verification time. Failure → `E_BOND_INSUFFICIENT_SATS`, `E_BOND_INSUFFICIENT_DAYS`, or `E_BOND_SPENT`.

### 7.2 Stamp_published as resolution

Pledges of the form "I will publish X by time T" use `resolution.mechanism = stamp_published`. The verifier looks up the named OC Stamp envelope via Nostr kind-30084 (per [OC Stamp SPEC §7](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#7-nostr-directory-optional)). This is the canonical composition for content-publication pledges.

### 7.3 Agent-signed pledges via OC Agent delegation

A principal MAY delegate `pledge:create` scope to an agent under an [OC Agent v1](https://github.com/orangecheck/oc-agent-protocol) delegation. The pledge envelope carries:

- `via_delegation`: 64-hex OC Agent delegation id
- `agent_address`: the agent's Bitcoin address
- `sig.pubkey`: equals `agent_address`
- `sig.value`: BIP-322 by agent over the pledge id

The pledge counts in the **principal's** public ledger, not the agent's. Verifier algorithm:

1. Resolve the named delegation per OC Agent SPEC §8.1.
2. Confirm `delegation.principal.address == swearer.address`.
3. Confirm `delegation.agent.address == agent_address`.
4. Confirm `delegation.scopes[]` contains a scope of the form `pledge:create(...)` with bond ceiling, mechanism, or address constraints satisfied by the pledge.
5. Confirm `delegation.expires_at > pledge.sworn_at`.
6. Verify `sig.value` under `agent_address`.

Agents MUST NOT publish abandonment envelopes in v1.0. Abandonment is principal-only.

Scope grammar for `pledge:create` (extension to OC Agent's scope grammar, coordinated via REGISTRY.md):

```
pledge:create
pledge:create(max_bond_sats=<N>)
pledge:create(mechanism=<m>)
pledge:create(counterparty=<addr>)
pledge:create(max_bond_sats=<N>,mechanism=<m>)
```

Multiple constraints comma-separated inside the parentheses. A pledge SHALL pass scope check iff every named constraint is satisfied.

### 7.4 Vote_resolves dispute mechanism

When `dispute.mechanism = vote_resolves`, a contested outcome is referred to an OC Vote poll. The `dispute.params` field carries the poll id and resolution criteria:

```
poll_id=<64-hex>;option=<option_id>;threshold=<decimal>
```

The dispute resolves when the OC Vote tally exceeds the named threshold for the named option.

### 7.5 Lock for confidential counterparty negotiation

This is a **usage pattern**, not a protocol feature: bilateral pledge counterparties MAY use [OC Lock v2](https://github.com/orangecheck/oc-lock-protocol) to negotiate pledge terms privately before the pledge is sworn publicly. Once sworn, the pledge envelope is plaintext and content-addressed; Lock plays no role at verification time.

## 8. Bond verification algorithm

```
verifyBond(pledge, now, chain) ->
  attestation = ocAttestResolve(pledge.bond.attestation_id, chain)
  if attestation == null:                       return E_BOND_NOT_FOUND
  if attestation.address != pledge.swearer:     return E_BOND_ADDRESS_MISMATCH
  if attestation.utxo_spent_at_or_before(now):  return E_BOND_SPENT
  if attestation.sats_bonded < pledge.bond.min_sats:
                                                return E_BOND_INSUFFICIENT_SATS
  if attestation.days_unspent(now) < pledge.bond.min_days:
                                                return E_BOND_INSUFFICIENT_DAYS
  return OK
```

The bond is verified at:

1. **`sworn_at`** — confirms the bond existed when the pledge was sworn.
2. **`now`** — confirms the bond still exists at the verifier's clock (the live signal).

Test vectors `v18-bond-valid.json`, `v19-bond-insufficient-sats.json`, `v20-bond-spent.json` pin the canonical decision tree.

A swearer who spends the bonded UTXO mid-pledge has degraded their bond signal; verifiers see `E_BOND_SPENT` and treat the pledge as bond-invalid in policies that require an active bond at verification time. This is structurally equivalent to breaking the pledge from the verifier's perspective, but the state-machine classification (§4.4) remains driven by outcome / abandonment envelopes — the protocol does not seize sats and does not auto-classify spent-bond as `broken`. See SECURITY.md §"bond-draining attack" for the threat-model rationale.

## 9. Verification algorithm

A **full verification** of (pledge, outcome | abandonment | none) produces one of:

- `OK { state, pledge_id, swearer, outcome_id?, abandonment_id?, evidence }` — all checks passed.
- An error code (§10).

### 9.1 Algorithm

Given pledge envelope `P`, optional outcome envelope `O`, optional abandonment envelope `A`, current time `now`, and current chain state `chain`:

1. **Version check.** `P.v == 1` else `E_UNSUPPORTED_VERSION`. Same for `O` and `A`.
2. **Shape check.** Required fields present and typed (§3.6, §4.2, §5.3); else `E_PLEDGE_MALFORMED`, `E_OUTCOME_MALFORMED`, or `E_ABANDONMENT_MALFORMED`.
3. **Pledge canonical consistency.** Reconstruct canonical message from `P`'s fields. `H(canonical) == P.id`? Else `E_PLEDGE_BAD_ID`.
4. **Pledge signature.** Verify `P.sig.value` per §3.5. Account for the agent path (§7.3) when `via_delegation` is present. Else `E_PLEDGE_BAD_SIG`.
5. **Bond.** Run §8 `verifyBond(P, now, chain)`.
6. **Outcome (if present).** Reconstruct canonical, check id, verify signature (if required by mechanism per §4.3). Else `E_OUTCOME_*`.
7. **Abandonment (if present).** Reconstruct canonical, check id, verify signature. Else `E_ABANDONMENT_*`.
8. **Mechanism re-evaluation.** For deterministic mechanisms, verifier MAY recompute the outcome envelope from public state and confirm byte-identity with `O`. Mismatch → `E_OUTCOME_EVIDENCE_MISMATCH`.
9. **State classification.** Run §4.4 transition function. Return the resulting state.

A **minimal verification** skips bond re-resolution (step 5) and mechanism re-evaluation (step 8). This is appropriate for offline previews; verifiers attaching consequential weight to the result MUST run full verification.

### 9.2 What verification guarantees

| Check clean | Guarantee |
|---|---|
| `E_PLEDGE_BAD_ID` | The canonical message reconstructs to the declared id. |
| `E_PLEDGE_BAD_SIG` | The holder of `swearer.address` (or `agent_address` under §7.3) authorized the canonical message. |
| `E_BOND_*` | The bond meets `min_sats` and `min_days` at verification time. |
| `E_OUTCOME_BAD_SIG` | The named resolver signed the outcome (where required). |
| `E_OUTCOME_EVIDENCE_MISMATCH` | The deterministic mechanism's evidence matches public state. |
| state-machine output | The pledge is in exactly one of the §4.4 states given the inputs. |

## 10. Errors

| Code | Meaning |
|---|---|
| `E_UNSUPPORTED_VERSION` | Envelope `v` is unknown. |
| `E_PLEDGE_MALFORMED` | Pledge envelope shape / field types / required fields invalid. Includes empty nonce, missing `bond`, both `time` and `block` in `resolves_at`. |
| `E_PLEDGE_BAD_ID` | Reconstructed canonical message does not hash to declared `id`. |
| `E_PLEDGE_BAD_SIG` | BIP-322 signature did not verify under `sig.pubkey` over hex `id`. |
| `E_RESOLUTION_UNKNOWN` | `resolution.mechanism` not in §3.4 set. |
| `E_RESOLUTION_NONDETERMINISTIC` | The chosen mechanism cannot produce a deterministic boolean from public state (e.g., a `self_proof` attempt or a malformed query string). |
| `E_BOND_NOT_FOUND` | The named OrangeCheck attestation cannot be resolved. |
| `E_BOND_ADDRESS_MISMATCH` | The attestation's address does not match `swearer.address`. |
| `E_BOND_SPENT` | The bonded UTXO was spent at or before the verifier's clock. |
| `E_BOND_INSUFFICIENT_SATS` | Resolved `sats_bonded < pledge.bond.min_sats`. |
| `E_BOND_INSUFFICIENT_DAYS` | Resolved `days_unspent < pledge.bond.min_days`. |
| `E_OUTCOME_MALFORMED` | Outcome envelope shape invalid. |
| `E_OUTCOME_BAD_ID` | Outcome canonical-message hash mismatch. |
| `E_OUTCOME_BAD_SIG` | Outcome signature required but did not verify. |
| `E_OUTCOME_EVIDENCE_MISMATCH` | Recomputed deterministic evidence differs from declared evidence. |
| `E_OUTCOME_RESOLVER_UNAUTHORIZED` | An outcome envelope was signed by a party not authorized to resolve this pledge (e.g., a stranger signing a `counterparty_signs` outcome). |
| `E_ABANDONMENT_MALFORMED` | Abandonment envelope shape invalid. |
| `E_ABANDONMENT_BAD_ID` | Abandonment canonical-message hash mismatch. |
| `E_ABANDONMENT_BAD_SIG` | Abandonment signature did not verify under the original swearer. |
| `E_DELEGATION_NOT_FOUND` | `via_delegation` references a delegation that cannot be resolved. |
| `E_DELEGATION_SCOPE_VIOLATED` | Pledge violates the delegation's `pledge:create` scope constraints. |
| `E_DELEGATION_EXPIRED` | Delegation `expires_at < pledge.sworn_at`. |

## 11. Security-relevant requirements

These restate cryptographic correctness conditions a conforming implementation MUST satisfy. SECURITY.md elaborates with attack scenarios.

1. **Reconstruct the canonical message before trusting the declared `id`.** Implementations MUST compute `H(canonical_message)` from the canonical-message inputs and compare to `envelope.id`. Accepting a declared `id` without reconstruction allows attackers to swap signed content.
2. **Verify `sig.value` before trusting envelope contents.** No exceptions in v1.0.
3. **Re-resolve every bond.** Implementations MUST run §8 `verifyBond` against live chain state. Trusting a stale OrangeCheck snapshot allows bond-draining attacks.
4. **Recompute deterministic outcome evidence on-demand.** A verifier presented with a deterministic outcome envelope SHOULD recompute the witness from public state and confirm byte-identity. Persisting only the envelope (without recomputation) is acceptable for archival; consequential decisions MUST recompute.
5. **Reject envelopes with stale or mismatched `sworn_at`.** Verifiers MAY reject pledges whose `sworn_at` is outside their tolerance window relative to `now()`.
6. **Reject empty nonces.** A pledge with `nonce: ""` MUST fail at envelope construction with `E_PLEDGE_MALFORMED`.
7. **Reject unknown `v` values.** Preserve unknown optional fields when relaying; ignore them when verifying.
8. **Produce byte-identical canonical messages** for identical inputs across implementations. Test-vector conformance (§14) is not optional.
9. **Sign the hex form of every id** (64 ASCII bytes) with BIP-322, not the raw 32 bytes. This applies to pledge, outcome, and abandonment envelopes alike.

## 12. Registry for extensions

See [REGISTRY.md](./REGISTRY.md) for the authoritative registry of mechanism strings, dispute-mechanism strings, scope grammar extensions for OC Agent integration, and the formal refusal of `self_proof`.

Brief summary of v1.0 registrations:

| Field | Current values | Reserved for |
|---|---|---|
| `resolution.mechanism` | `chain_state`, `counterparty_signs`, `nostr_event_exists`, `stamp_published`, `http_get_hash`, `dns_record`, `vote_resolves` | Future: extension via PR with working integrator code (REGISTRY §extension) |
| `dispute.mechanism` | `null`, `vote_resolves`, `named_oracle` | Future extensions per REGISTRY |
| `remediation` | `breach_recorded` | Reserved (no slashing in v1.0; see WHY §H7) |
| `swearer.alg` | `bip322` | Future: `bip340-schnorr-direct`, `pq-hybrid` |
| `sig.alg` | `bip322` | Same as `swearer.alg` |

## 13. Versioning policy

`envelope.v` is an integer. Future incompatible changes increment it. Clients MUST reject envelopes whose `v` they do not support. Minor additions (new optional registry values, new evidence witness shapes for new mechanisms) are handled by unknown-field tolerance (§3.7).

v1.0 is the first stable release of OC Pledge. The repository's initial commit drop was published as v0.1.0-alpha (2026-04) and incremented through implementation conformance + the cross-impl test-vector battery before reaching this stable cut.

## 14. Compliance checklist

A client is OC Pledge v1.0 compliant if and only if:

- [ ] Produces canonical messages byte-for-byte per §3.1, §4.1, §5.1 for identical inputs
- [ ] Computes `pledge_id`, `outcome_id`, `abandonment_id` as `H(canonical_message)` and serializes as 64 lowercase hex chars
- [ ] Produces envelopes with all required fields per §3.3, §4.2, §5.2
- [ ] Signs the hex form of every id via BIP-322
- [ ] Canonicalizes envelopes per §6 (RFC 8785)
- [ ] Refuses pledges with `resolution.mechanism` outside §3.4 with `E_RESOLUTION_UNKNOWN`
- [ ] Refuses pledges with empty nonce with `E_PLEDGE_MALFORMED`
- [ ] Re-resolves bonds against live chain state per §8 before trusting any pledge for consequential decisions
- [ ] Implements the §4.4 state-machine transition as a pure function
- [ ] Recomputes deterministic outcome evidence on-demand for §3.4.1, §3.4.3, §3.4.4, §3.4.5, §3.4.6 mechanisms
- [ ] Verifies signature on `counterparty_signs` outcome envelopes against the named counterparty
- [ ] Treats abandonment envelopes as `broken` in the public ledger, full stop (no honorable exit)
- [ ] Resolves agent-delegated pledges (§7.3) under OC Agent v1 verification rules
- [ ] Produces error codes per §10
- [ ] Rejects unknown `v` values; preserves unknown fields on relay
- [ ] Passes every committed test vector in [`test-vectors/`](./test-vectors/)

## 15. Future work (non-normative)

v1.0 explicitly does NOT solve:

- **Aggregated reputation scores.** Public-ledger queries (`pledges_sworn`, `outcomes_for`, `bond_in_flight`) ship as raw metrics; no canonical scoring function. Platforms compose their own policies. See WHY §H6.
- **Slashing-based remediation.** No HTLC, no covenant, no escrow. Bond enforcement is by public exposure only. See WHY §H7.
- **Cross-chain or L2 anchors.** Bitcoin mainnet only.
- **Pledge chains** (one pledge whose outcome is the predicate of another). Composable in principle; deferred from v1.0 to keep the state machine flat. See WHY §H10.
- **Revocation.** A sworn pledge cannot be unsworn. Abandonment (§5) is the only graceful-exit primitive. See WHY §H8.
- **Receipt-freeness for vote_resolves disputes.** Inherits OC Vote v1's posture; secret-ballot dispute resolution is feasible but deferred.
- **Extension mechanisms outside the §3.4 registry.** REGISTRY.md governs new mechanism strings; v1.0 explicitly refuses `self_proof` and any free-text "trust me" proofs.
- **Post-quantum authenticity.** secp256k1 and SHA-256 both have finite lifetimes against sufficiently large quantum computers.

## 16. IANA / external identifiers

- Nostr event kind: **30078** (NIP-78 "application-specific data" — addressable, parameter-replaceable). Reused from the OrangeCheck family transport. The three `d`-tag namespaces claimed by this spec are documented in [NIP_ORANGECHECK_PLEDGE.md](./NIP_ORANGECHECK_PLEDGE.md):
  - `oc-pledge:<pledge_id>`
  - `oc-pledge-outcome:<pledge_id>`
  - `oc-pledge-abandonment:<pledge_id>`
- File extensions: `.pledge`, `.pledge-outcome`, `.pledge-abandonment`
- MIME types:
  - `application/vnd.oc-pledge+json`
  - `application/vnd.oc-pledge-outcome+json`
  - `application/vnd.oc-pledge-abandonment+json`

(All MIME types are self-allocated and not IANA-registered as of this writing.)

## 17. Acknowledgements

OC Pledge stands on:

- **OrangeCheck** for the `sats_bonded × days_unspent` stake oracle that gives bonds their teeth without requiring custody.
- **OC Stamp** for the canonical-message + BIP-322 + Nostr kind-30078 envelope discipline that this spec inherits verbatim.
- **OC Vote** for the offline-tallyable poll primitive used as the dispute mechanism.
- **OC Agent** for the delegation primitive that enables agent-signed pledges.
- **OC Lock** for the confidential-coordination pattern that bilateral counterparties may use before swearing publicly.
- **Bram Kanstein** for the "Bitcoin as sovereignty substrate" framing that grounds this entire family.

The six verbs of sovereign sociality — *am, whisper, decide, declare, delegate, swear* — are now complete.

---

End of specification.
