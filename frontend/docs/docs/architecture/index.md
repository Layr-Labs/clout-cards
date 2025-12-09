# Architecture Overview

Clout Cards is built with a modern, secure architecture that combines on-chain asset management with off-chain game logic.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  - Wallet Connection    - Game UI    - Real-time Updates (SSE)  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Node.js/Express)                  │
│  - Game Logic    - Event Signing    - Twitter Auth    - SSE     │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │    PostgreSQL     │   │   Smart Contract  │
        │   (Game State)    │   │  (Asset Custody)  │
        └───────────────────┘   └───────────────────┘
```

## Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| [Smart Contracts](smart-contracts.md) | Solidity | Asset custody, deposits, withdrawals |
| [Backend](backend.md) | Node.js, Express, Prisma | Game logic, event signing, API |
| [Frontend](frontend.md) | React, TypeScript | User interface, wallet integration |
| [Events](events.md) | PostgreSQL NOTIFY, SSE | Real-time game updates |

## Design Principles

### 1. Trustless Asset Management
- All funds are held in smart contracts
- Users maintain custody of their assets
- Withdrawals require user signature

### 2. Signed Event Chain
- Every game action is signed by the server
- Events are cryptographically verifiable
- Full audit trail in the database

### 3. Real-time Updates
- Server-Sent Events (SSE) for live updates
- PostgreSQL LISTEN/NOTIFY for efficient broadcasting
- No polling required

### 4. Social Identity
- Twitter OAuth for identity
- Profile pictures and handles displayed at tables
- Social features (chat) tied to Twitter identity

## Data Flow

1. **Deposits**: User → Smart Contract → Backend listens → Updates balance
2. **Game Actions**: User → Backend → Database + Event → SSE broadcast
3. **Withdrawals**: User → Backend signs → User → Smart Contract

## Security Model

- **Assets**: Secured by smart contract (on-chain)
- **Game Logic**: Server-side only (prevents cheating)
- **Identity**: Twitter OAuth + wallet signature
- **Events**: EIP-712 signed payloads

## Open Source

Clout Cards is fully open source. View the complete codebase on GitHub:

- **[GitHub Repository](https://github.com/Layr-Labs/clout-cards)** - Full source code
- **[Issues](https://github.com/Layr-Labs/clout-cards/issues)** - Report bugs or request features
- **[Pull Requests](https://github.com/Layr-Labs/clout-cards/pulls)** - Contribute improvements

