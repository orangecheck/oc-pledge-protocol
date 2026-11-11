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
    "envelope": { ...full envelope JSON; sig.value is a placeholder, except in v59–v63... }
  },
  "signature_check": {
    "address_type": "p2pkh" | "p2sh_p2wpkh" | "p2wpkh" | "p2tr",
    "format": "bip137" | "bip322-simple",
    "signed_message": "<the hex pledge_id, the string the wallet signed>",
    "expected": { "outcome": "ACCEPT" } | { "outcome": "REJECT", "error_code": "E_PLEDGE_BAD_SIG" }
  }
}
```

`signature_check` is present only in v59–v63.

### Shape B — verification or transition vectors

```json
{
  "description": "what this vector exercises",
  "kind": "bond-verification" | "state-transition" | "scope-check" | "malformed-input",
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

For an envelope vector with `signature_check`, a compliant implementation MUST also verify `expected.envelope` with SPEC §9.1 step 4 and a real BIP-322 verifier: `ACCEPT` means the signature verifies, `REJECT` means verification fails with `error_code`.

For Shape B vectors, a compliant implementation MUST produce the `expected.state` (for state-transition vectors), the `expected.code` (for bond-verification vectors) or, for each of a scope-check vector's `inputs.cases`, the result at the same place in `expected.cases` (`ok` and the first `matched_scope`, or `E_DELEGATION_SCOPE_VIOLATED`), given the inputs and any relevant public-state fixtures. Bond vectors that carry `now` and `utxos` (the attested address's confirmed unspent outputs, `block_time` in Unix seconds) also give `expected.days_unspent`; an implementation that ages coins itself MUST derive it from them per SPEC §8.

For Shape C malformed-input vectors, a compliant implementation MUST raise the named `expected.error` code at envelope construction (or as early as possible during verification). A Shape C vector that gives an `envelope` or an `outcome_envelope` names the error verification MUST return for it; when it also gives a `twin`, the twin has the same id and MUST verify.

A state-transition vector's `abandonment_envelope` enters the state machine only when it verifies against the vector's pledge (SPEC §11.10), the signature aside.

A state-transition vector may give `outcome_envelopes`, several outcome envelopes for its pledge, in place of one `outcome_envelope`. They enter the state machine together, and the state MUST NOT depend on their order (SPEC §4.4).

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Trailing LF after the final line (the spec says no trailing LF).
- CRLF line endings instead of LF.
- Capitalizing the hex `pledge_id` or `bond.attestation_id`.
- Missing the domain separator `oc-pledge/v1` on the first line.
- Emitting numeric fields (`min_sats`, `min_days`) as strings in the envelope JSON.
- Including both `time:` and `block:` lines in `resolves_at:` (must be exactly one).
- Accepting an empty `nonce`.
- Treating an abandonment envelope as anything other than `broken` in the public ledger.
- Refusing an outcome or abandonment for the length or emptiness of its free text, or for a line break in `reason` or `evidence.witness` (v34–v36, v38–v40).
- Accepting a line feed in `evidence.result`, whose bytes are another envelope's (v41).
- Hashing a lone surrogate as anything but U+FFFD (v37).
- Accepting the string `"null"` as a counterparty, dispute params or dispute mechanism (v42, v43, v45).
- Matching digits with a Unicode-aware `\d` (v44).
- Accepting a bech32 address in capitals, which names the same key as its lowercase spelling but is compared and tagged by exact string: as swearer, agent (where it passes as an address that differs from the swearer's), counterparty or resolver (v55–v58).
- Letting a scope constraint the verifier does not recognise pass the scope check (v46).
- Counting the resolver's own contradiction dated after the earliest settling outcome's dispute window (v47), or keeping a pledge with no dispute mechanism `disputed` after `expires_at` (v49).
- Letting the counterparty's `dispute_window_ends_at` shut out a swearer counter-claim (v52, v53).
- Letting a swearer's counter-claim settle a `counterparty_signs` pledge by itself (v51).

## A note on signatures

In v01–v58, the `sig.value` field in the `expected.envelope` block is a placeholder (`"AAAA"` for pledge / outcome / abandonment envelopes), not a signature. Those vectors test the canonical message, the id and the envelope; a verifier that runs them needs its signature check stubbed.

v59–v63 carry real signatures from disclosed burn keys (see "Signature vectors" below). Two wallets signing the same id need not produce the same bytes: an ECDSA wallet may not use RFC 6979 nonces, and a BIP-340 (P2TR) signature takes fresh auxiliary randomness. The assertion is that a signature **verifies** under the named pubkey over the hex id, never that it equals a stored one.

## Test harness

The forthcoming `@orangecheck/pledge-core` suite in `oc-packages/pledge-core/` will load this directory and assert:

1. `canonical_message` is reconstructed byte-identical from `inputs`.
2. The id (`pledge_id` / `outcome_id` / `abandonment_id`) equals `sha256(canonical_message)`.
3. Envelope fields re-serialize to the declared canonical form (RFC 8785).
4. State-transition fixtures produce the named `expected.state`.
5. Bond-verification fixtures produce the named `expected.code` (or `OK`).
6. Malformed-input fixtures raise the named `expected.error`.

It also verifies each vector with `signature_check` through the real `@orangecheck/bip322` verifier, expects the verdict the vector names, and checks that the set covers all four address types plus a refused signature.

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
| `v29-bond-age-of-covering-coins.json` | B | Bond verification: `days_unspent` is the age of the coins covering `min_sats`, not of the oldest output. |
| `v30-bond-age-stops-at-cover.json` | B | Bond verification: the covering coins stop at `min_sats`; a newer output beyond them does not lower the age. |
| `v31-state-outcome-dated-after-now.json` | B | State machine: an outcome whose `resolved_at` is later than `now` does not classify the pledge yet → pending (SPEC §4.4). |
| `v32-state-signed-outcome-after-expiry.json` | B | State machine: a signed counterparty outcome dated after `expires_at` comes too late → expired_unresolved (SPEC §3.4.2, §4.4). |
| `v33-pledge-agent-is-swearer-rejected.json` | C | The v01 pledge with `via_delegation` added and `agent_address` set to the swearer MUST be rejected by verification (SPEC §7.3). |
| `v34-abandonment-reason-past-280-bytes.json` | A | Abandonment whose reason is 311 bytes, past what a signer may write: a verifier MUST NOT refuse it (SPEC §5.1). |
| `v35-abandonment-reason-empty.json` | A | Abandonment with an empty reason: a verifier MUST NOT refuse it (SPEC §5.1). |
| `v36-outcome-evidence-empty.json` | A | Signed broken outcome whose evidence result and witness are empty: a verifier MUST NOT refuse it (SPEC §4.1). |
| `v37-abandonment-reason-lone-surrogate.json` | A | Abandonment whose reason holds a lone surrogate: canonical bytes encode it as U+FFFD (`EF BF BD`), and the id is over those bytes (SPEC §0). |
| `v38-abandonment-reason-line-break.json` | A | Abandonment whose reason holds a CR LF: the reason is the last line after strict fields, so a verifier MUST NOT refuse it (SPEC §5.1). |
| `v39-state-broken-via-abandonment-line-break.json` | B | State machine: the v26 pledge with that abandonment, which verifies → broken (SPEC §5.1, §11.10). |
| `v40-outcome-witness-line-break.json` | A | Signed broken outcome whose witness spans lines: every field after it is strict, so a verifier MUST NOT refuse it (SPEC §4.1). |
| `v41-outcome-result-line-feed-rejected.json` | C | Outcome whose `evidence.result` holds a line feed MUST be rejected with `E_OUTCOME_MALFORMED`: its bytes and id are those of `twin`, whose result is one line, and `twin` verifies (SPEC §4.1). |
| `v42-pledge-counterparty-null-string-rejected.json` | C | The v01 pledge with `counterparty` the string `"null"`: same id as v01, MUST be rejected; `twin` (v01) verifies (SPEC §3.6). |
| `v43-pledge-dispute-params-null-string-rejected.json` | C | The v01 pledge with `dispute.params` the string `"null"`: same id as v01, MUST be rejected; `twin` (v01) verifies (SPEC §3.6). |
| `v44-pledge-time-non-ascii-digits-rejected.json` | C | A pledge whose `sworn_at` year is in Arabic-Indic digits, its id the hash of its own canonical message: MUST be rejected (SPEC §0). |
| `v45-pledge-dispute-mechanism-null-string-rejected.json` | C | The v01 pledge with `dispute.mechanism` the string `"null"`: same id as v01, MUST be rejected; `twin` (v01) verifies (SPEC §3.6). |
| `v46-delegation-scope-check.json` | B | 31 delegation scope cases: whether the pledge satisfies a `pledge:create` scope, and which one (SPEC §7.3, REGISTRY.md §4). |
| `v55-pledge-swearer-capitals-rejected.json` | C | The v01 pledge with `swearer.address` in capitals, its id the hash of its own canonical message: MUST be rejected with `E_PLEDGE_MALFORMED` (SPEC §2). |
| `v56-pledge-agent-is-swearer-in-capitals-rejected.json` | C | v33 with `agent_address` the swearer's address in capitals: MUST be rejected with `E_PLEDGE_MALFORMED`, not read as a different address (SPEC §2, §7.3). |
| `v57-pledge-counterparty-capitals-rejected.json` | C | The v03 pledge with `counterparty` in capitals, its id the hash of its own canonical message: MUST be rejected with `E_PLEDGE_MALFORMED` (SPEC §2). |
| `v58-outcome-resolved-by-capitals-rejected.json` | C | The v13 outcome with `resolved_by` in capitals, its id the hash of its own canonical message: MUST be rejected with `E_OUTCOME_MALFORMED` (SPEC §2). |
| `v59-sig-p2pkh.json` | A | v01's pledge sworn by a P2PKH address, legacy BIP-137 signature: MUST verify. |
| `v60-sig-p2sh-p2wpkh.json` | A | The same, P2SH-P2WPKH, BIP-322 simple signature: MUST verify. |
| `v61-sig-p2wpkh.json` | A | The same, P2WPKH, BIP-322 simple signature: MUST verify. |
| `v62-sig-p2tr.json` | A | The same, P2TR key path, BIP-322 simple signature: MUST verify. |
| `v63-sig-tampered.json` | A | v61 with one signature byte flipped: MUST NOT verify (`E_PLEDGE_BAD_SIG`). |

### Signature vectors (v59–v63)

These are v01's pledge with its swearer replaced, wherever v01 names it (the `swearer` line, the `chain_state` query, `swearer.address` and `sig.pubkey`), by an address of one of four **disclosed burn keys**. The private keys are published in `generate-signatures.mjs` and must never hold funds: anyone can spend what is sent to their addresses. They are the keys `oc-stamp-protocol`'s v10–v14 use; keys #1 and #2 are also `oc-attest-protocol`'s tv21 and tv22.

| Key | Private key (hex) | Address type | Address | Vectors |
|---|---|---|---|---|
| #1 | `01` repeated 32 times | P2WPKH | `bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw` | v61, v63 |
| #2 | `02` repeated 32 times | P2TR, key path (BIP-86) | `bc1p5e6v9v2j5wp3y6c79gaqdqltq7jdv45fswnnm7exmmp2020mqepsmcx06p` | v62 |
| #3 | `03` repeated 32 times | P2PKH | `16yH2E12NYA5pg1d4BB7wtXXnBTZ8Lws7L` | v59 |
| #4 | `04` repeated 32 times | P2SH-P2WPKH | `38Sqvnn4PbsHHfarwki7bm2vSeYvuZDgpz` | v60 |

The wallet signs the 64-character lowercase hex pledge id (SPEC §3.5), so `signature_check.signed_message` equals `expected.pledge_id`. SPEC §2 lists P2WPKH, P2TR and P2PKH; §3.6 verifies `sig.value` under BIP-322 for whatever address `sig.pubkey` names, and v60 covers the nested SegWit form.

`node test-vectors/generate-signatures.mjs` writes v59–v63 again from v01. It loads bip322-js 3, bitcoinjs-lib 6, ecpair 2 and @bitcoinerlab/secp256k1 from `oc-packages/wallet-adapter/node_modules` in a clone next to this repository, or from the directory in `OC_SIGNER_NODE_MODULES`. v59–v61 and v63 come out byte for byte the same; v62's P2TR signature differs on each run and still verifies.

## Round-trip verification

The vector generator at authoring time round-trips at least one pledge envelope (re-canonicalizes, re-hashes, asserts equal) before committing the fixture. The generator is not committed; vectors are the artifact. Re-running the generator with identical inputs produces identical ids — that property is the conformance bedrock.

## How these were generated

A one-shot Node.js script under `/tmp` at authoring time computed every canonical message and SHA-256 id deterministically from the `inputs` block. The script verifies a self-test before writing files: it serializes vector `v01` canonically, hashes the bytes, and asserts the result equals the expected id. If you reimplement the canonical-message builder in a different language, you should be able to reproduce every id in this directory exactly.

v59–v63 are the exception: `generate-signatures.mjs`, committed here, writes them (see "Signature vectors" above).

## License

Test vectors are MIT (per the repository LICENSE).
