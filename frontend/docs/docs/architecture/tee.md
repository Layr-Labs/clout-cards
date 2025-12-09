# EigenCloud TEE

Clout Cards runs inside a **Trusted Execution Environment (TEE)** to provide cryptographic guarantees that the game logic is executed correctly and cannot be tampered with.

!!! tip "Build on EigenCloud"
    Want to build your own verifiable application with TEE security? EigenCloud makes it easy to deploy trustless backends with cryptographic guarantees. Get started at the [EigenCloud Developer Docs](https://developers.eigencloud.xyz?utm_source=clout-cards).

## What is a TEE?

A Trusted Execution Environment is a secure, isolated area of a processor that guarantees:

- **Confidentiality**: Data inside the enclave cannot be read by anyone, including the server operator
- **Integrity**: Code running inside cannot be modified
- **Attestation**: The enclave can prove what code it's running

## Google Confidential Spaces

Clout Cards is deployed on **Google Confidential Spaces**, which provides:

| Feature | Description |
|---------|-------------|
| Hardware-backed isolation | AMD SEV-SNP secure processor technology |
| Memory encryption | All enclave memory is encrypted |
| Remote attestation | Cryptographic proof of enclave integrity |
| No operator access | Even Google cannot access enclave data |

## The TEE Private Key

At the heart of Clout Cards' security model is a **private key that never leaves the enclave**:

```
┌─────────────────────────────────────────────────────┐
│              TEE Enclave (Confidential)             │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │           TEE Private Key                   │   │
│   │   (Generated inside, never exported)        │   │
│   └─────────────────────────────────────────────┘   │
│                        │                            │
│                        ▼                            │
│   ┌─────────────────────────────────────────────┐   │
│   │         EIP-712 Signature Engine            │   │
│   │   - Signs game events                       │   │
│   │   - Signs withdrawal authorizations         │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Key Properties

1. **Generated inside the enclave** - The private key is created when the TEE starts and never exists outside
2. **Never exported** - There is no mechanism to extract the key
3. **Deterministic derivation** - The same enclave code always produces the same key (via attestation-bound derivation)

## What Gets Signed

Every significant action is signed by the TEE private key using **EIP-712 typed signatures**:

### Game Events

| Event Type | Signed Data |
|------------|-------------|
| `hand_start` | Table, players, blinds, dealer position |
| `hand_action` | Action type, amount, player, hand state |
| `hand_end` | Winners, pot distribution, final hands |
| `join_table` | Player, seat, buy-in amount |
| `leave_table` | Player, seat, balance returned |

### Withdrawal Authorizations

| Field | Description |
|-------|-------------|
| Player address | Who can withdraw |
| Amount | How much (in gwei) |
| Nonce | Unique per withdrawal |
| Expiry | When signature expires |

## Verification

Anyone can verify that data was processed inside the TEE:

### 1. Get the TEE Public Key

The TEE's public key is derived from the private key and can be retrieved:

```
GET /teePublicKey
```

### 2. Verify Event Signatures

Each event in the database contains:

```json
{
  "eventId": 1234,
  "kind": "hand_action",
  "payloadJson": "{...}",
  "digest": "0x...",
  "sigR": "0x...",
  "sigS": "0x...",
  "sigV": 27,
  "teePubkey": "0x..."
}
```

Verify by:
1. Compute EIP-712 digest from `payloadJson`
2. Recover signer from `(sigR, sigS, sigV)`
3. Confirm recovered address matches `teePubkey`

### 3. Verify Attestation

Google Confidential Spaces provides attestation that proves:
- The exact code running in the enclave
- The enclave's integrity
- The binding between the code and the TEE public key

## Security Guarantees

| Guarantee | How It's Achieved |
|-----------|-------------------|
| Game logic integrity | Code runs in attested TEE |
| No card manipulation | RNG and dealing inside enclave |
| Withdrawal security | Only TEE can sign valid withdrawals |
| Audit trail | All events signed and verifiable |
| Operator honesty | Operator cannot forge signatures |

## Why This Matters

Without the TEE:

- The server operator could manipulate game outcomes
- Withdrawal signatures could be forged
- There would be no proof that the game was fair

With the TEE:

- **Provably fair** - Every action is signed by tamper-proof code
- **Trustless** - You don't need to trust the operator
- **Verifiable** - Anyone can verify the signatures match the TEE
- **Secure** - Private key cannot be extracted, even by the operator

## EigenCloud Integration

Clout Cards uses **EigenCloud** for TEE deployment and management:

- Simplified deployment to Google Confidential Spaces
- Key management and attestation services
- Monitoring and logging (without exposing sensitive data)

The combination of EigenCloud + Google Confidential Spaces provides enterprise-grade security for trustless game execution.

