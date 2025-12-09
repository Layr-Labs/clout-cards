# Verifiability

Clout Cards implements a **cryptographically verifiable audit trail** that allows anyone to prove game integrity—even though all data is stored in a traditional PostgreSQL database. The key insight is that **the data is signed by tamper-proof code running inside a TEE**, making it impossible for anyone (including the operator) to modify historical events without detection.

!!! tip "Build on EigenCloud"
    The verification architecture described here is powered by **EigenCloud**. Build your own verifiable applications with TEE-backed cryptographic guarantees. Learn more at the [EigenCloud Developer Docs](https://developers.eigencloud.xyz?utm_source=clout-cards).

## The Trust Model

Traditional online poker requires trusting the operator not to cheat. Clout Cards inverts this model:

| Traditional Poker | Clout Cards |
|------------------|-------------|
| Trust the operator | Trust math and hardware |
| Audit by regulation | Audit by cryptography |
| Opaque game logic | Verifiable signatures |
| Database is source of truth | Database is verifiable cache |

## Event Chain Architecture

Every state-changing operation in Clout Cards creates an **immutable, signed event**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEE (Trusted Execution Environment)          │
│                                                                 │
│   RPC Call ──► Process Logic ──► Create Event ──► Sign Event   │
│                     │                                │          │
│                     ▼                                ▼          │
│              Update Cache Tables           EIP-712 Signature    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                          │
│                                                                 │
│   Events Table (Source of Truth):                               │
│   - event_id, kind, payload_json                                │
│   - digest, sig_r, sig_s, sig_v                                 │
│   - tee_pubkey, tee_version                                     │
│                                                                 │
│   Cache Tables (Derived State):                                 │
│   - player_escrow_balances, hands, pots, etc.                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The **Events Table** is the cryptographic source of truth. All other tables are caches that can be reconstructed by replaying the event log.

## How Digests Are Computed

Every event is signed using **EIP-712 typed data signatures**, the same standard used for signing Ethereum transactions. This provides:

- **Structured data** - Not just raw bytes, but typed fields
- **Domain separation** - Signatures are bound to a specific chain and application
- **Human readability** - Wallets can display what's being signed

### EIP-712 Domain

All Clout Cards events share this domain:

```typescript
{
  name: 'CloutCardsEvents',
  version: '1',
  chainId: <network_chain_id>,
  verifyingContract: '0x0000000000000000000000000000000000000000'
}
```

### Payload Structure

Events are signed as `RPCPayload` typed data:

```typescript
const PAYLOAD_TYPES = {
  RPCPayload: [
    { name: 'kind', type: 'string' },      // Event type
    { name: 'payload', type: 'string' },   // Canonical JSON
    { name: 'nonce', type: 'uint256' },    // For replay protection
  ],
};
```

### Digest Computation

The digest (hash) is computed using the standard EIP-712 algorithm:

```typescript
digest = keccak256(
  "\x19\x01" +
  domainSeparator +
  hashStruct(RPCPayload)
)
```

This produces a 32-byte hash that uniquely represents the event payload within the domain context.

## How Signatures Are Verified

Each event stored in the database contains:

| Field | Description |
|-------|-------------|
| `payloadJson` | The canonical JSON of the game action |
| `digest` | The EIP-712 hash of the payload |
| `sigR`, `sigS`, `sigV` | ECDSA signature components |
| `teePubkey` | The TEE's Ethereum address |

### Verification Steps

To verify any event:

1. **Recompute the digest** from `payloadJson` using EIP-712
2. **Verify digest matches** the stored `digest` field
3. **Recover the signer** from the signature using ECDSA recovery
4. **Compare addresses** - recovered address must match `teePubkey`

```typescript
// Client-side verification (simplified)
const message = {
  kind: event.kind,
  payload: event.payloadJson,
  nonce: BigInt(0),
};

// Recompute digest
const computedDigest = ethers.TypedDataEncoder.hash(domain, PAYLOAD_TYPES, message);

// Recover signer from signature
const recoveredAddress = ethers.recoverAddress(computedDigest, {
  r: event.sigR,
  s: event.sigS,
  v: event.sigV,
});

// Verify signer matches TEE
const isValid = recoveredAddress.toLowerCase() === event.teePubkey.toLowerCase();
```

If verification succeeds, you have **mathematical proof** that:
- The payload has not been modified since signing
- The signature was created by the holder of the TEE private key
- The TEE private key never leaves the secure enclave

## Deck Commitment Verification

For poker, the deck shuffle must be provably fair. Clout Cards uses a **commit-reveal scheme**:

### At Hand Start

1. TEE generates a **random 256-bit nonce**
2. TEE shuffles the deck using secure randomness
3. TEE computes commitment: `hash = keccak256(JSON.stringify(deck) + nonce)`
4. Only the `shuffleSeedHash` is published in the `hand_start` event

### During the Hand

- Players cannot reverse-engineer the deck from the hash
- The nonce makes brute-forcing computationally infeasible
- Cards are dealt according to the pre-committed deck order

### At Hand End

1. TEE reveals the full `deck` array and the `nonce`
2. Anyone can verify: `keccak256(deck + nonce) === shuffleSeedHash`
3. If they match, the deck was committed at the start and never modified

```typescript
// Deck verification
const deckJson = JSON.stringify(deck);
const computedHash = ethers.keccak256(ethers.toUtf8Bytes(deckJson + nonce));
const isValid = computedHash === shuffleSeedHash;
```

This proves that the TEE could not have changed the deck during the hand—for example, to deal favorable cards to a particular player.

## The History Explorer

Clout Cards includes a built-in **History Explorer** that makes verification accessible to all users. It's available through the "Hand History" panel at any table.

### Hand History List

The panel shows all completed hands with:

- Hand number and timestamp
- Community cards dealt
- Total pot size
- Winner(s)

### Hand Detail View

Clicking a hand opens the detailed verification view:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                                        Hand #142    ✕   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🛡️ TEE Signature Verification              ✓ All Valid    │  │
│  │                                                           │  │
│  │ 5/5 events verified                                       │  │
│  │ ▼ Show events                                             │  │
│  │                                                           │  │
│  │   Event #234: hand_start     ✓ Valid                      │  │
│  │   Event #235: hand_action    ✓ Valid                      │  │
│  │   Event #236: community_cards ✓ Valid                     │  │
│  │   Event #237: hand_action    ✓ Valid                      │  │
│  │   Event #238: hand_end       ✓ Valid                      │  │
│  │                                                           │  │
│  │   TEE Address: 0x7B2e...F3a9                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔒 Deck Commitment                         ✓ Verified      │  │
│  │                                                           │  │
│  │ Committed Hash: 0x8f3a...2e1b                             │  │
│  │ Computed Hash:  0x8f3a...2e1b                             │  │
│  │                                                           │  │
│  │ 👁️ View Full Deck                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Community Cards: [A♠] [K♠] [Q♠] [J♠] [10♠]                    │
│                                                                 │
│  Pot: 0.05 ETH                                                 │
│  Winner: Seat 3 (Royal Flush)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Verified

| Check | What It Proves |
|-------|----------------|
| **Signature verification** | Event was created by the TEE and not modified |
| **Digest match** | Stored hash matches recomputed hash from payload |
| **TEE address match** | Signature recovers to the expected TEE address |
| **Deck commitment** | Cards dealt match the committed deck at hand start |

### Expandable Event Details

Each event can be expanded to show:

- Full JSON payload
- EIP-712 digest
- Signature components (r, s, v)
- TEE version that signed it

## Why Centralized Storage Doesn't Matter

A common objection: "If the database is centralized, can't the operator just change the data?"

The answer is **no**, because of how cryptographic signatures work:

### What the Operator Cannot Do

| Attack | Why It Fails |
|--------|--------------|
| Modify an event payload | Signature verification fails |
| Change player balances | Events that set balances are signed |
| Alter deck after commit | Hash verification fails |
| Forge new events | Would need TEE private key |
| Sign with different key | TEE pubkey is verifiable via attestation |

### What the Operator Could Do (But It's Obvious)

| Attack | Detection |
|--------|-----------|
| Delete events | Event ID gaps are visible |
| Withhold events | Players notice missing hands |
| Stop the service | Players can withdraw via smart contract |

### The Database as a Verifiable Cache

Think of the database as a **signed append-only log**:

```
Event 1: { action: "deposit", amount: "0.1 ETH", sig: "..." }
Event 2: { action: "hand_start", players: [...], sig: "..." }
Event 3: { action: "hand_action", type: "RAISE", sig: "..." }
Event 4: { action: "hand_end", winners: [...], sig: "..." }
...
```

- Any modification invalidates signatures
- Any deletion creates visible gaps
- The TEE private key is the only way to create valid signatures
- The TEE private key cannot be extracted (hardware guarantee)

## Verification Without Trust

The verification system enables multiple levels of assurance:

### Level 1: UI Verification

Users can verify hands directly in the app through the History Explorer. Green checkmarks indicate valid signatures and deck commitments.

### Level 2: Manual Verification

Developers can export event data and verify signatures using standard Ethereum libraries:

```bash
# Export events
psql -c "SELECT * FROM events WHERE kind = 'hand_end'" > events.json

# Verify with ethers.js, web3.js, or any EIP-712 library
```

### Level 3: Full Audit

For complete verification:

1. Get the TEE attestation from EigenCloud
2. Verify the attestation proves specific code is running
3. Verify the TEE public key matches the attestation
4. Verify all event signatures against that public key
5. Replay events to reconstruct all derived state
6. Compare derived state with database state

### Level 4: Open Source

The entire codebase is open source on **[GitHub](https://github.com/Layr-Labs/clout-cards)**:

- Backend game logic
- TEE signing code
- Frontend verification utilities
- Smart contracts

Anyone can audit the code that runs inside the TEE.

## Summary

Clout Cards achieves **trustless verification** through:

| Component | Purpose |
|-----------|---------|
| **TEE** | Ensures code integrity and key isolation |
| **EIP-712 signatures** | Cryptographically binds events to TEE |
| **Deck commitments** | Proves fair dealing without revealing cards |
| **Event chain** | Creates immutable audit trail |
| **History Explorer** | Makes verification accessible to all users |

The result is a poker game where:

- ✅ You don't need to trust the operator
- ✅ Every hand can be verified independently
- ✅ Cheating is mathematically impossible (with correct TEE)
- ✅ The database is just a signed cache, not the source of truth
- ✅ Even the operator cannot forge valid signatures

This architecture proves that **centralized infrastructure can provide decentralized guarantees** when combined with trusted execution and cryptographic verification.

