# Lifecycle of an OC Pledge envelope

> **Normative companion to [`SPEC.md`](./SPEC.md), [`WHY.md`](./WHY.md) §H8, and [`REGISTRY.md`](./REGISTRY.md).** This document specifies what a swearer MAY do to a pledge after publication, and what a verifier MUST do in response. It does not introduce new envelope kinds or canonical-message fields. It pins down the lifecycle stance already established in §H8 and the registry.

## 0. The family stance

Every OrangeCheck artifact is a **signed envelope**. The signature is the truth; the Nostr event is a directory entry; the bytes already exist on relays and in caches the moment an envelope is published. *Delete* is therefore not a protocol primitive in any verb of the family. The vocabulary the family does define is:

| Verb | What it means |
|---|---|
| **replace** | Publish a new envelope under the same addressable coordinate. NIP-33 replacement applies; the older event is no longer canonical. |
| **revoke** | Publish a *separate, signed* envelope that ends the legitimacy of a prior one. Per-verb whether this exists. |
| **withdraw** | Spend the Bitcoin UTXO(s) backing a bond. Visible to verifiers on the next live check. |
| **expire** | Reach `expires_at` (or `deadline`). |
| **abandon** *(OC Pledge only)* | Publish a signed `oc-pledge-abandonment/v1` envelope. Counts as `broken` in the ledger — see §1.2. |
| **hide (out-of-protocol)** | A reference dashboard MAY filter the artifact out of its UI. No protocol effect. |
| **request relay deletion (out-of-protocol)** | Publish a NIP-09 kind-5 event. Best-effort; not normative. |

## 1. OC Pledge lifecycle

OC Pledge's job is to bind a Bitcoin address to a forward-looking proposition with a public bond. The verb's central design refusal — restated from [`WHY.md`](./WHY.md) §H8 — is that **a pledge you can walk back is not a pledge.** Allowing structured revocation creates an obvious race: swearers revoke immediately before foreseeable failure to dodge the `broken` classification. The spec deliberately closes this race.

### 1.1 Pledges are NOT revocable

This spec does **not** define any envelope kind, tag, or canonical-message field that retracts a published pledge such that it disappears from the ledger. The d-tag namespaces under kind 30078 are exhausted by `oc-pledge:<id>` (the pledge), `oc-pledge-outcome:<id>` (the deterministic or signed outcome), and `oc-pledge-abandonment:<id>` (see below). There is no fourth namespace for revocation, and conforming verifiers MUST treat any envelope that claims to revoke a pledge outside the abandonment path as malformed.

### 1.2 Abandonment is the only structured exit, and it counts as broken

`oc-pledge-abandonment/v1` is the swearer's lone protocol-recognized way to step out of a pledge before the resolution mechanism fires. Its semantics, fixed by [`SPEC.md`](./SPEC.md):

- Signed by the same Bitcoin address that swore the pledge.
- Published as Nostr kind 30078 with d-tag `oc-pledge-abandonment:<pledge_id>`.
- A verifier observing both an `oc-pledge-abandonment:<id>` and any later `oc-pledge-outcome:<id>` MUST treat the pledge's terminal state as `broken`. Abandonment never resolves to `kept`.
- Abandonment is one-way. Once published, a pledge stays in the broken column even if the underlying proposition would have resolved truthfully.

This is the "graceful exit" — not a revocation. The price of the exit is permanently joining the broken-pledge ledger for that address.

### 1.3 Withdrawal of bond

The bond named in `bond.attestation_id` is a public commitment, not custody. Spending the UTXOs that back it is always permitted by Bitcoin and never blocked by this spec. Effects:

- A verifier evaluating bond sufficiency at outcome time queries live chain state. If the UTXOs were spent before the deadline, `bond.sats >= bond.min_sats` and `bond.days >= bond.min_days` MAY both fail; the verifier reports `E_INSUFFICIENT_BOND` and the pledge resolves `broken` regardless of whether the proposition itself would have resolved truthfully.
- Withdrawal is therefore a *de facto* path to `broken`. The protocol does not pretend otherwise.

### 1.4 The pledge envelope itself is immutable

A pledge envelope's canonical message is content-addressed. The swearer cannot edit a published pledge in place; rewriting any byte produces a different `id` and a different envelope. Re-publishing under the same `d`-tag is structurally impossible because the d-tag *is* the id.

### 1.5 Out-of-protocol controls

The reference dashboard at [ochk.io/dashboard](https://ochk.io/dashboard) MAY offer:

- **Hide on my dashboard** — local UI filter; no protocol effect. The pledge is still on the ledger and still being evaluated by every verifier.
- **Withdraw bond (informational)** — the dashboard MAY explain to the swearer that this means *spending the named UTXOs in their wallet*, with the consequence described in §1.3. The dashboard does not perform the spend; it can only tell the truth about what spending implies.
- **Request relay deletion** — best-effort NIP-09; no protocol effect; the verifier ignores it.

A conforming verifier MUST ignore all three signals and continue evaluating the pledge per its outcome envelope, abandonment envelope, deadline, and live bond state.

### 1.6 Compliance summary

| Implementation MUST | Implementation MUST NOT |
|---|---|
| Treat `oc-pledge-abandonment:<id>` as the *only* pre-deadline exit, and resolve any abandoned pledge as `broken`. | Define or honor any envelope, tag, or field that retracts a pledge from the ledger. |
| Re-resolve `bond.sats` / `bond.days` against live chain state at outcome time and apply `E_INSUFFICIENT_BOND` if the bond decayed. | Allow a "pledge revocation" or "delete pledge" code path to suppress evaluation of the proposition. |
| Continue surfacing pledges that were filtered or NIP-09-deleted on UI surfaces — the ledger is not a UI. | Treat dashboard-local hide flags or NIP-09 deletion-request events as protocol signals. |
