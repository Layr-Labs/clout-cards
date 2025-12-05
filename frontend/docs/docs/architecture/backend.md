# Backend Services

The backend handles game logic, authentication, and real-time events.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Framework | Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Language | TypeScript |

## Core Services

### Game Logic (`/services`)

| Service | Purpose |
|---------|---------|
| `startHand.ts` | Initialize new poker hands |
| `playerAction.ts` | Process fold/call/raise/check/all-in |
| `pokerHandEvaluation.ts` | Determine winning hands |
| `potSplitting.ts` | Calculate side pots |

### Authentication

| Service | Purpose |
|---------|---------|
| `userAuth.ts` | Wallet signature verification |
| `twitter.ts` | Twitter OAuth handling |
| Middleware | `walletAuth.ts`, `twitterAuth.ts` |

### Asset Management

| Service | Purpose |
|---------|---------|
| `escrowBalance.ts` | Track player balances |
| `withdrawalSigning.ts` | Sign withdrawal authorizations |
| `contractListener.ts` | Listen for on-chain events |

## API Structure

### Public Endpoints (No Auth)
- `GET /pokerTables` - List all tables
- `GET /tablePlayers` - List players at a table
- `GET /watchCurrentHand` - Current hand state (no hole cards)
- `GET /leaderboard` - Top players

### Authenticated Endpoints
- `POST /joinTable` - Join a poker table
- `POST /standUp` - Leave a table
- `POST /action` - Make a poker action
- `GET /currentHand` - Current hand with hole cards
- `POST /signEscrowWithdrawal` - Request withdrawal signature

### Real-time
- `GET /api/tables/:tableId/events` - SSE stream for table events

## Database Schema

Key models:

```
PokerTable
├── Hand (1:many)
│   ├── HandPlayer (1:many)
│   ├── HandAction (1:many)
│   └── Pot (1:many)
└── TableSeatSession (1:many)

PlayerEscrowBalance
Event (audit log)
LeaderboardStats
```

## Event Signing

All game events are signed using EIP-712:

1. Event payload is serialized to JSON
2. EIP-712 digest is computed
3. Server signs with TEE private key
4. Signature (r, s, v) is stored with event

This creates a verifiable audit trail of all game actions.

## Background Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| Action Timeout Checker | 1.5s | Auto-fold timed-out players |
| Hand Start Checker | 1.5s | Start hands when ready |
| Contract Listener | Real-time | Process on-chain events |

