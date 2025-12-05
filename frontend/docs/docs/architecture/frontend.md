# Frontend Architecture

The frontend is a React single-page application with real-time updates.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | React 19 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | CSS (custom) |
| Animation | Framer Motion |
| Routing | React Router |

## Project Structure

```
frontend/src/
├── components/       # Reusable UI components
├── contexts/         # React contexts (Wallet)
├── hooks/            # Custom hooks
├── services/         # API client functions
├── utils/            # Utility functions
├── App.tsx           # Main app with routing
├── Table.tsx         # Poker table view
├── Play.tsx          # Table list view
├── Profile.tsx       # User profile
└── Leaderboard.tsx   # Leaderboard page
```

## Key Components

### Wallet Integration

```typescript
// contexts/WalletContext.tsx
- connectWallet()     // Connect MetaMask
- disconnectWallet()  // Disconnect
- ensureCorrectChain() // Switch to Base Sepolia
```

### Real-time Events

```typescript
// hooks/useTableEvents.ts
- SSE connection to /api/tables/:tableId/events
- Automatic reconnection with backoff
- Event queue for sequential processing
```

### API Client

```typescript
// services/apiClient.ts
- Centralized fetch wrapper
- Auth header injection
- Error handling
```

## State Management

The app uses React's built-in state management:

| Scope | Solution |
|-------|----------|
| Global (wallet) | React Context |
| Page-level | useState/useReducer |
| Server state | Custom hooks with fetch |

## Real-time Updates

Events flow from server to UI:

```
PostgreSQL NOTIFY
      ↓
SSE Endpoint (/api/tables/:id/events)
      ↓
useTableEvents hook
      ↓
EventQueue (sequential processing)
      ↓
handleEvent callback
      ↓
setState updates
      ↓
UI re-renders with animations
```

## Animations

Framer Motion handles animations:

- Player join/leave transitions
- Card dealing animations
- Action announcements
- Balance count-up effects
- Chat panel slide-in

## Authentication Flow

```
1. Connect Wallet (MetaMask)
      ↓
2. Sign Session Message
      ↓
3. Store signature in memory
      ↓
4. Twitter OAuth redirect
      ↓
5. Store Twitter token in localStorage
      ↓
6. User is "fully logged in"
```

## Environment Configuration

```typescript
// config/env.ts
- isProduction()      // Check NODE_ENV
- getBackendUrl()     // API base URL
- getTargetChain()    // Chain config (Base Sepolia / local)
```

