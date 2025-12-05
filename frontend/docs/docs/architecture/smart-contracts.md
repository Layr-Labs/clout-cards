# Smart Contracts

The Clout Cards smart contract handles all on-chain asset management.

## Contract Overview

| Item | Value |
|------|-------|
| Network | Base Sepolia |
| Contract | CloutCards (Upgradeable Proxy) |
| Standard | ERC-1967 Proxy Pattern |

## Core Functions

### Deposits

```solidity
function deposit() external payable
```

- Accepts ETH and credits the sender's escrow balance
- Emits `Deposited(address indexed player, uint256 amount)`
- No minimum deposit required

### Withdrawals

```solidity
function withdraw(
    address to,
    uint256 amount,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
) external
```

- Requires server signature (prevents unauthorized withdrawals)
- Signature includes nonce and expiry for security
- Transfers ETH to the specified address

## Escrow Balance

Each player has an escrow balance tracked on-chain:

```solidity
mapping(address => uint256) public escrowBalances;
```

- Increased by deposits
- Decreased by withdrawals
- Game winnings/losses are handled off-chain, then settled via withdrawals

## Events

| Event | Parameters | Description |
|-------|------------|-------------|
| `Deposited` | player, amount | ETH deposited to escrow |
| `Withdrawn` | player, to, amount | ETH withdrawn from escrow |

## Security Features

### Signature Verification
- Withdrawals require EIP-712 typed signatures
- Server signs with TEE private key
- Prevents unauthorized withdrawals

### Nonce System
- Each withdrawal has a unique nonce
- Prevents replay attacks
- Tracked per-player

### Expiry
- Signatures expire after a set time
- Prevents stale withdrawal requests
- Currently: 5 minutes

## Upgradeability

The contract uses the ERC-1967 proxy pattern:

- **Proxy Contract**: Holds state and delegates calls
- **Implementation**: Contains logic, can be upgraded
- **Admin**: Can upgrade implementation (multisig recommended)

!!! warning "Upgrade Risks"
    Contract upgrades should be carefully reviewed and tested. State corruption is possible if not handled correctly.

