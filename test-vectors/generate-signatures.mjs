#!/usr/bin/env node
/**
 * Signature vector generator for OC Pledge (v59-v63).
 *
 *   node test-vectors/generate-signatures.mjs
 *
 * Signs v01's pledge once per address type with a disclosed burn key, so a
 * second implementation can check its BIP-322 wiring against real signatures:
 * P2PKH (legacy BIP-137 form), P2SH-P2WPKH, P2WPKH and P2TR (BIP-322 simple
 * form). v63 is v61 with one signature byte flipped and MUST NOT verify.
 *
 * The private keys below are published and never to be used for funds.
 * Anyone can spend what is sent to their addresses. Keys #1 and #2 are the
 * ones oc-attest-protocol's tv21 and tv22 use, and oc-stamp-protocol's v10-v14
 * use all four.
 *
 * Dependencies (bip322-js 3, bitcoinjs-lib 6, ecpair 2,
 * @bitcoinerlab/secp256k1) come from a node_modules that has them: by default
 * oc-packages/wallet-adapter in a clone next to this repository, or the
 * directory in OC_SIGNER_NODE_MODULES. ECDSA signing is RFC 6979
 * deterministic; a P2TR signature can differ on each run and still verifies.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES =
    process.env.OC_SIGNER_NODE_MODULES ??
    join(HERE, '..', '..', 'oc-packages', 'wallet-adapter', 'node_modules');
const require = createRequire(join(MODULES, '_.js'));
const bip322 = require('bip322-js');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoinerlab/secp256k1');
const { ECPairFactory } = require('ecpair');
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.bitcoin;

// Disclosed burn keys. Never send bitcoin to the addresses they derive.
const KEYS = {
    p2wpkh: '01'.repeat(32), // oc-attest-protocol key #1 (tv21)
    p2tr: '02'.repeat(32), // oc-attest-protocol key #2 (tv22)
    p2pkh: '03'.repeat(32),
    p2sh_p2wpkh: '04'.repeat(32),
};

function keyPair(hex) {
    return ECPair.fromPrivateKey(Buffer.from(hex, 'hex'), { network });
}

function addressOf(type, hex) {
    const pubkey = Buffer.from(keyPair(hex).publicKey);
    if (type === 'p2pkh') return bitcoin.payments.p2pkh({ pubkey, network }).address;
    if (type === 'p2wpkh') return bitcoin.payments.p2wpkh({ pubkey, network }).address;
    if (type === 'p2sh_p2wpkh')
        return bitcoin.payments.p2sh({ redeem: bitcoin.payments.p2wpkh({ pubkey, network }), network })
            .address;
    if (type === 'p2tr')
        return bitcoin.payments.p2tr({ internalPubkey: pubkey.subarray(1, 33), network }).address;
    throw new Error(`unknown address type ${type}`);
}

// v01 with its swearer replaced wherever it appears: the swearer line, the
// chain_state query that names it, the envelope's swearer and sig.pubkey.
const V01 = readFileSync(join(HERE, 'v01-pledge-minimal-chain-state.json'), 'utf8');
const V01_SWEARER = JSON.parse(V01).inputs.swearer;

function fromV01(address) {
    const v = JSON.parse(V01.split(V01_SWEARER).join(address));
    const message = v.expected.canonical_message;
    const id = createHash('sha256').update(message, 'utf8').digest('hex');
    return { v, message, id };
}

function vector({ file, description, type, format, address, signature, expected }) {
    const { v, message, id } = fromV01(address);
    v.description = description;
    v.expected.canonical_message_bytes_len = Buffer.byteLength(message, 'utf8');
    v.expected.pledge_id = id;
    v.expected.envelope.id = id;
    v.expected.envelope.sig.value = signature;
    v.signature_check = { address_type: type, format, signed_message: id, expected };
    return { file, body: v };
}

const TYPES = [
    ['v59-sig-p2pkh.json', 'p2pkh', 'bip137', 'a P2PKH address: a legacy BIP-137 signature'],
    ['v60-sig-p2sh-p2wpkh.json', 'p2sh_p2wpkh', 'bip322-simple', 'a P2SH-P2WPKH address: a BIP-322 simple signature'],
    ['v61-sig-p2wpkh.json', 'p2wpkh', 'bip322-simple', 'a P2WPKH address: a BIP-322 simple signature'],
    ['v62-sig-p2tr.json', 'p2tr', 'bip322-simple', 'a P2TR address (key path): a BIP-322 simple signature'],
];

const out = [];
for (const [file, type, format, what] of TYPES) {
    const address = addressOf(type, KEYS[type]);
    const { id } = fromV01(address);
    // SPEC §3.5: the wallet signs the 64-character lowercase hex pledge id.
    const signature = bip322.Signer.sign(keyPair(KEYS[type]).toWIF(), address, id);
    if (!bip322.Verifier.verifySignature(address, id, signature))
        throw new Error(`${file}: bip322-js does not verify its own signature`);
    out.push(
        vector({
            file,
            description: `v01's pledge sworn by ${what} over the hex pledge id, from a disclosed burn key; MUST verify`,
            type,
            format,
            address,
            signature,
            expected: { outcome: 'ACCEPT' },
        })
    );
}

// v63: v61 with the middle signature byte flipped; length and base64 shape unchanged.
{
    const base = out[2].body;
    const address = base.inputs.swearer;
    const bytes = Buffer.from(base.expected.envelope.sig.value, 'base64');
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    const signature = bytes.toString('base64');
    if (bip322.Verifier.verifySignature(address, base.expected.pledge_id, signature))
        throw new Error('v63: the flipped signature still verifies');
    out.push(
        vector({
            file: 'v63-sig-tampered.json',
            description: 'v61 with one signature byte flipped; MUST NOT verify (E_PLEDGE_BAD_SIG)',
            type: 'p2wpkh',
            format: 'bip322-simple',
            address,
            signature,
            expected: { outcome: 'REJECT', error_code: 'E_PLEDGE_BAD_SIG' },
        })
    );
}

for (const { file, body } of out) {
    writeFileSync(join(HERE, file), JSON.stringify(body, null, 2) + '\n', 'utf8');
    console.log(`${file}: ${body.inputs.swearer}`);
}
