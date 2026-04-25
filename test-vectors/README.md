# OC Pledge test vectors

Fixed inputs, fixed canonical message strings, fixed SHA-256 ids. Any conforming OC Pledge v0.1 implementation MUST produce byte-identical canonical messages and matching ids for these vectors. If you're implementing OC Pledge in a new language, these are the ground truth.

## Structure

Each `.json` file in this directory is an independent vector. Three vector shapes are present:

### Shape A — envelope vectors (pledge / outcome / abandonment)

```json
{
  "description": "what this vector exercises",
  "kind": "pledge" | "pledge-outcome" | "pledge-abandonment",
  "inputs": { ...mechanism-specific input fields... },
  "expected": {
    "canonical_message": "<exact LF-terminated bytes as a JSON string>",
    "canonical_message_bytes_len": <integer>,
    "pledge_id" | "outcome_id" | "abandonment_id": "<64-hex SHA-256>",
    "envelope": { ...full envelope JSON with sig.value as a placeholder... }
  }
}
```

### Shape B — verification or transition vectors

```json
{
  "description": "what this vector exercises",
  "kind": "bond-verification" | "state-transition" | "malformed-input",
  "inputs": { ...inputs to the function under test... },
  "expected": { ...expected output or error code... }
}
```

### Shape C — malformed-input vectors

Same as Shape B, with an `expected.error` field naming the spec-defined error code that a conforming implementation MUST raise.

## Conformance

Given the `inputs` of an envelope vector, a compliant implementation MUST:

1. Build the canonical message byte-identical to `expected.canonical_message` (each line LF-terminated, no trailing LF after the final line, no BOM).
2. Compute `id = sha256(canonical_message_bytes)` and match `expected.pledge_id` / `outcome_id` / `abandonment_id`.
3. Serialize the envelope with RFC 8785 JSON canonicalization, matching `expected.envelope` when re-parsed.
4. Return the id as lowercase hex.

For Shape B vectors, a compliant implementation MUST produce the `expected.state` (for state-transition vectors) or the `expected.code` (for bond-verification vectors), given the inputs and any relevant public-state fixtures.

For Shape C malformed-input vectors, a compliant implementation MUST raise the named `expected.error` code at envelope construction (or as early as possible during verification).

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Trailing LF after the final line (the spec says no trailing LF).
- CRLF line endings instead of LF.
- Capitalizing the hex `pledge_id` or `bond.attestation_id`.
- Missing the domain separator `oc-pledge/v1` on the first line.
- Emitting numeric fields (`min_sats`, `min_days`) as strings in the envelope JSON.
- Including both `time:` and `block:` lines in `resolves_at:` (must be exactly one).
- Accepting an empty `nonce`.
- Treating an abandonment envelope as anything other than `broken` in the public ledger.

## A note on signatures

BIP-322 signatures over ECDSA addresses (P2PKH, P2WPKH) are **non-deterministic** because ECDSA uses random `k`. Vectors cannot specify an exact `sig.value` and expect reproducibility across wallets. The `sig.value` field in the `expected.envelope` block is a placeholder (`"AAAA"` for pledge / outcome / abandonment envelopes). The implementation-side assertion is that the signature **verifies** under the named pubkey over the hex id, not that it equals a specific blob.

BIP-322 signatures over Schnorr addresses (P2TR, BIP-340) are deterministic when RFC 6979-style nonce derivation is used, but vendor wallets vary. Treat Schnorr `sig.value` fields as verify-only.

## Test harness

The forthcoming `@orangecheck/pledge-core` suite in `oc-packages/pledge-core/` will load this directory and assert:

1. `canonical_message` is reconstructed byte-identical from `inputs`.
2. The id (`pledge_id` / `outcome_id` / `abandonment_id`) equals `sha256(canonical_message)`.
3. Envelope fields re-serialize to the declared canonical form (RFC 8785).
4. State-transition fixtures produce the named `expected.state`.
5. Bond-verification fixtures produce the named `expected.code` (or `OK`).
6. Malformed-input fixtures raise the named `expected.error`.

New implementations should add a similar test.

## Vector index

| File | Shape | Exercises |
|---|---|---|
| `v01-pledge-minimal-chain-state.json` | A | Minimal pledge with `chain_state` mechanism, no counterparty, no dispute. |
| `v02-pledge-stamp-published.json` | A | Pledge with `stamp_published` mechanism — research preregistration shape. |
| `v03-pledge-counterparty-signs-bilateral.json` | A | Bilateral pledge with `counterparty_signs` resolution and pre-named `vote_resolves` dispute. |
| `v04-pledge-http-get-hash.json` | A | Pledge with `http_get_hash` deterministic resolution — open-source delivery shape. |
| `v05-pledge-nostr-event-exists.json` | A | Pledge with `nostr_event_exists` mechanism — public-statement-by-deadline shape. |
| `v06-pledge-dns-record.json` | A | Pledge with `dns_record` mechanism — domain-control attestation shape. |
| `v07-pledge-vote-resolves.json` | A | Pledge with `vote_resolves` mechanism — community-judged commitment shape. |
| `v08-pledge-agent-delegated.json` | A | Agent-signed pledge under OC Agent `pledge:create` delegation; pledge counts against principal. |
| `v09-pledge-edge-same-time.json` | A | Edge case: `resolves_at == expires_at` (zero grace window). |
| `v10-pledge-block-height-resolved.json` | A | Block-height resolution with same-block witness. |
| `v11-outcome-kept-deterministic-chain-state.json` | A | Outcome envelope: kept, deterministic chain_state result. |
| `v12-outcome-kept-stamp-published.json` | A | Outcome envelope: kept, stamp_published, deterministic. |
| `v13-outcome-kept-counterparty-signs.json` | A | Outcome envelope: counterparty_signs kept, requires BIP-322 from counterparty. |
| `v14-outcome-broken-http-get-hash.json` | A | Outcome envelope: broken, http_get_hash result mismatch. |
| `v15-outcome-disputed-contradictory.json` | A | Outcome envelope: disputed, contradictory counterparty outcome triggers vote-resolves dispute path. |
| `v16-outcome-expired-unresolved.json` | A | Outcome envelope: expired_unresolved, no counterparty signature within expiration window. |
| `v17-abandonment-counts-as-broken.json` | A | Abandonment envelope — swearer admits early failure; counts as broken in the public ledger. |
| `v18-bond-valid.json` | B | Bond verification: attestation resolves to >= min_sats and >= min_days. |
| `v19-bond-insufficient-sats.json` | B | Bond verification: sats_bonded falls short of min_sats. |
| `v20-bond-spent.json` | B | Bond verification: utxo spent before resolves_at; bond-draining attack. |
| `v21-bilateral-consistent.json` | B | Bilateral pledge: both parties publish kept; state resolves to kept. |
| `v22-bilateral-contradictory.json` | B | Bilateral pledge: contradictory outcomes; state resolves to disputed. |
| `v23-state-pending.json` | B | State machine: sworn but resolves_at in future → pending. |
| `v24-state-resolvable.json` | B | State machine: past resolves_at, before expires_at, no outcome → resolvable. |
| `v25-state-kept.json` | B | State machine: outcome=kept, dispute window passed → kept. |
| `v26-state-broken-via-abandonment.json` | B | State machine: abandonment envelope before resolves_at → broken (no honorable exit). |
| `v27-state-expired-unresolved.json` | B | State machine: past expires_at with no consistent outcome → expired_unresolved. |
| `v28-empty-nonce-rejected.json` | C | Pledge with empty `nonce` MUST be rejected at envelope construction. |

## Round-trip verification

The vector generator at authoring time round-trips at least one pledge envelope (re-canonicalizes, re-hashes, asserts equal) before committing the fixture. The generator is not committed; vectors are the artifact. Re-running the generator with identical inputs produces identical ids — that property is the conformance bedrock.

## How these were generated

A one-shot Node.js script under `/tmp` at authoring time computed every canonical message and SHA-256 id deterministically from the `inputs` block. The script verifies a self-test before writing files: it serializes vector `v01` canonically, hashes the bytes, and asserts the result equals the expected id. If you reimplement the canonical-message builder in a different language, you should be able to reproduce every id in this directory exactly.

## License

Test vectors are CC BY 4.0 (per the repository LICENSE).
