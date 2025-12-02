# Server-Sent Events (SSE) Implementation Plan

## Overview

Replace polling-based table state updates with Server-Sent Events (SSE) for real-time, low-latency updates. This will enable smooth animations, sequential event processing, and better UX for poker table interactions.

## Goals

- ✅ Real-time event streaming (no polling lag)
- ✅ Sequential event processing (events processed in order, one at a time)
- ✅ Smooth animations (betting, dealing, card reveals)
- ✅ Proper hand end display (show winner before next hand starts)
- ✅ Efficient database queries (no application-level filtering)

## Architecture Decisions

### Technology Choice: SSE over WebSockets

**Why SSE:**
- One-way server→client (perfect for event streaming)
- Simpler implementation (HTTP-based, built-in reconnection)
- Lower overhead than WebSockets
- Native browser support (`EventSource` API)
- Easier to debug (can test with curl)

**Why not WebSockets:**
- Bidirectional communication not needed (actions via REST API)
- More complex (connection management, manual reconnection)
- Overkill for this use case

### Database Strategy: LISTEN/NOTIFY

**Why LISTEN/NOTIFY:**
- Zero polling overhead (database pushes notifications)
- Real-time updates (events stream immediately)
- PostgreSQL native feature (no external dependencies)
- Efficient (only sends events for subscribed tables)

**Fallback:** Polling every 500ms if LISTEN/NOTIFY unavailable

## Implementation Phases

### Phase 1: Database Schema Changes ✅

**Status:** Completed

**Tasks:**
1. Add `tableId` column to `Event` model (optional, nullable)
2. Add index on `tableId` for efficient filtering
3. Create database migration
4. Update `createEventInTransaction` to extract and store `tableId` from payload

**Note:** No backfill needed - existing events will have `tableId = null`, which is fine. New events going forward will have `tableId` populated.

**Event Analysis:**
- ✅ **HAND_START** - Has `table.id` in payload
- ✅ **HAND_END** - Has `table.id` in payload
- ✅ **BET** (hand_action) - Has `table.id` in payload
- ✅ **COMMUNITY_CARDS** - Has `table.id` in payload
- ✅ **JOIN_TABLE** - Has `table.id` in payload
- ✅ **LEAVE_TABLE** - Has `table.id` in payload
- ⚠️ **CREATE_TABLE** - No `table.id` needed (no clients listening yet)
- ⚠️ **DEPOSIT** - No `table` field (wallet-level, `tableId` = null)
- ⚠️ **WITHDRAWAL_*** - No `table` field (wallet-level, `tableId` = null)

**Note:** CREATE_TABLE events don't need `tableId` because no clients are subscribed to that table's events at creation time. Wallet-level events (DEPOSIT, WITHDRAWAL_*) correctly have no `tableId` (null).

**Files to Modify:**
- `prisma/schema.prisma` - Add `tableId` field and index
- `src/db/events.ts` - Update `createEventInTransaction` to extract `tableId`
- Create migration: `prisma/migrate dev --name add_table_id_to_events`

**Schema Changes:**
```prisma
model Event {
  // ... existing fields ...
  tableId       Int?     @map("table_id") // NEW: Optional table ID
  // ... rest of fields ...
  
  table         PokerTable? @relation(fields: [tableId], references: [id])
  
  @@index([tableId]) // NEW: Index for efficient filtering
  // ... existing indexes ...
}
```

**Code Changes:**
```typescript
// In createEventInTransaction
let tableId: number | null = null;
try {
  const payload = JSON.parse(payloadJson);
  tableId = payload.table?.id || null;
} catch {
  // If payload parsing fails, tableId stays null
}

await tx.event.create({
  data: {
    // ... existing fields ...
    tableId: tableId, // NEW
  },
});
```

---

### Phase 2: PostgreSQL LISTEN/NOTIFY Setup ✅

**Status:** Completed

**Tasks:**
1. Create database trigger function to notify on new events
2. Create trigger on `events` table
3. Set up PostgreSQL client connection pool for notifications
4. Test trigger manually

**SQL Migration:**
```sql
-- Create notification function
CREATE OR REPLACE FUNCTION notify_new_event() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_event', 
    json_build_object(
      'eventId', NEW.event_id,
      'tableId', NEW.table_id,
      'kind', NEW.kind
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER event_notify_trigger
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_event();

-- Add index if not exists (should be in Phase 1 migration)
CREATE INDEX IF NOT EXISTS events_table_id_idx ON events(table_id);
```

**Files to Create:**
- `src/db/eventNotifier.ts` - PostgreSQL client and notification handling
- Migration file: `prisma/migrations/XXXXXX_add_event_notify_trigger/migration.sql`

**Code Structure:**
```typescript
// src/db/eventNotifier.ts
import { Client } from 'pg';

let pgClient: Client | null = null;

async function getPgClient(): Promise<Client> {
  // Initialize and connect PostgreSQL client
  // Listen to 'new_event' channel
}

export function setupEventNotifier(callback: (data: {eventId: number, tableId: number | null}) => void) {
  // Set up notification listener
}
```

---

### Phase 3: Backend SSE Endpoint ✅

**Status:** Completed

**Tasks:**
1. Create SSE endpoint `/api/tables/:tableId/events`
2. Implement LISTEN/NOTIFY integration
3. Handle reconnection with `lastEventId` query param
4. Send missed events on connection
5. Stream new events via NOTIFY
6. Handle client disconnection cleanup
7. Add error handling and logging

**Endpoint Specification:**

```
GET /api/tables/:tableId/events?lastEventId=123

Headers:
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  X-Accel-Buffering: no

Query Params:
  - lastEventId (optional): Resume from this event ID

Response Format:
  : connected\n\n
  id: 123\n
  data: {"kind":"hand_start",...}\n\n
  id: 124\n
  data: {"kind":"bet",...}\n\n
```

**Files to Create/Modify:**
- `src/routes/tableEvents.ts` - SSE endpoint handler (or add to `src/index.ts`)
- `src/db/eventNotifier.ts` - Notification handling (from Phase 2)

**Implementation Notes:**
- Use `tableId` column for efficient filtering (no JSON parsing)
- Send missed events first (events with `eventId > lastEventId`)
- Then listen for new events via NOTIFY
- Clean up on `req.on('close')`
- Handle errors gracefully (log, don't crash)

**Code Structure:**
```typescript
app.get('/api/tables/:tableId/events', async (req: Request, res: Response): Promise<void> => {
  // 1. Parse params
  // 2. Set SSE headers
  // 3. Send missed events
  // 4. Set up NOTIFY listener
  // 5. Stream new events
  // 6. Clean up on disconnect
});
```

---

### Phase 4: Frontend Event Queue ⏳

**Status:** Not Started

**Tasks:**
1. Create `EventQueue` class for sequential processing
2. Implement event ordering by `eventId`
3. Ensure async event handlers complete before next event
4. Handle errors gracefully (continue processing)
5. Add queue clearing on unmount

**Files to Create:**
- `frontend/src/utils/eventQueue.ts` - Event queue implementation

**Features:**
- Maintains ordered queue (by `eventId`)
- Processes one event at a time
- Waits for async handlers to complete
- Handles out-of-order events (inserts in correct position)
- Error handling (logs, continues processing)

**Code Structure:**
```typescript
class EventQueue {
  private queue: TableEvent[] = [];
  private processing = false;
  
  async enqueue(event: TableEvent): Promise<void> {
    // Insert in order by eventId
    // Start processing if not already processing
  }
  
  private async processQueue(): Promise<void> {
    // Process events one at a time
    // Wait for each handler to complete
  }
}
```

---

### Phase 5: Frontend SSE Hook ⏳

**Status:** Not Started

**Tasks:**
1. Create `useTableEvents` React hook
2. Integrate `EventSource` API
3. Integrate `EventQueue` for sequential processing
4. Handle reconnection with exponential backoff
5. Track connection state
6. Handle `lastEventId` for reconnection
7. Clean up on unmount

**Files to Create:**
- `frontend/src/hooks/useTableEvents.ts` - SSE hook with queue integration

**Features:**
- Automatic reconnection (exponential backoff)
- Connection state tracking
- Event ID tracking for reconnection
- Queue integration for sequential processing
- Cleanup on unmount

**Code Structure:**
```typescript
export function useTableEvents(options: {
  tableId: number;
  onEvent: (event: TableEvent) => Promise<void> | void;
  enabled?: boolean;
}) {
  // 1. Create EventQueue
  // 2. Set up EventSource connection
  // 3. Parse events and enqueue
  // 4. Handle reconnection
  // 5. Return connection state
}
```

---

### Phase 6: Frontend Integration ⏳

**Status:** Not Started

**Tasks:**
1. Integrate `useTableEvents` in `Table.tsx`
2. Handle each event type:
   - `hand_start` → Trigger dealing animation
   - `bet`/`call`/`raise`/`all_in` → Animate bet action
   - `community_cards` → Reveal cards one at a time
   - `hand_end` → Show winner, delay next hand
3. Keep polling as fallback (initial state only)
4. Remove polling once SSE is stable
5. Add loading states and error handling

**Files to Modify:**
- `frontend/src/Table.tsx` - Integrate SSE hook, handle events

**Event Handlers:**
```typescript
useTableEvents({
  tableId: tableId!,
  enabled: !!tableId,
  onEvent: async (event) => {
    switch (event.kind) {
      case 'hand_start':
        await animateDealing(event.payload);
        break;
      case 'bet':
      case 'call':
      case 'raise':
      case 'all_in':
        await animateBet(event.payload);
        break;
      case 'community_cards':
        await revealCardsSequentially(event.payload);
        break;
      case 'hand_end':
        await showWinner(event.payload);
        await delay(3000); // 3 second delay
        break;
    }
  },
});
```

**Animation Functions to Create:**
- `animateDealing()` - Deal cards with animation
- `animateBet()` - Animate chips moving to pot
- `revealCardsSequentially()` - Reveal community cards one at a time
- `showWinner()` - Display winner modal/overlay

---

### Phase 7: Testing & Validation ⏳

**Status:** Not Started

**Tasks:**
1. Test SSE connection and reconnection
2. Test sequential event processing
3. Test event ordering (out-of-order events)
4. Test with multiple clients (same table)
5. Test error handling (database errors, network errors)
6. Test performance (many events, many clients)
7. Validate animations work correctly
8. Test hand end → winner display → next hand delay

**Test Scenarios:**
- [ ] Single event arrives → processes correctly
- [ ] Multiple events arrive at once → processes sequentially
- [ ] Events arrive out of order → reorders correctly
- [ ] Connection drops → reconnects automatically
- [ ] Reconnection → receives missed events
- [ ] Hand end → shows winner → delays next hand
- [ ] Bet action → animates correctly
- [ ] Community cards → reveals sequentially
- [ ] Multiple clients → all receive events

---

### Phase 8: Migration & Cleanup ⏳

**Status:** Not Started

**Tasks:**
1. Keep polling as fallback during migration
2. Monitor SSE performance and errors
3. Gradually migrate users to SSE
4. Remove polling code once SSE is stable
5. Update documentation
6. Add monitoring/logging

**Migration Strategy:**
1. Deploy SSE endpoint (backward compatible)
2. Deploy frontend with SSE + polling fallback
3. Monitor for issues
4. Remove polling after 1-2 weeks of stable operation

---

## Technical Details

### SSE Message Format

Each event is sent in SSE format:
```
id: 12345\n
event: hand_start\n
data: {"kind":"hand_start","table":{"id":1},"hand":{"id":2}}\n\n
```

- `id:` - Event ID (used for reconnection)
- `event:` - Optional event type (defaults to "message")
- `data:` - JSON payload
- `\n\n` - Double newline marks end of message

### Event Payload Structure

Events already have `table.id` in payload:
```json
{
  "kind": "hand_start",
  "table": {
    "id": 1,
    "name": "High Stakes"
  },
  "hand": { ... }
}
```

We'll extract `table.id` and store in `tableId` column.

### Connection Management

**Backend:**
- One SSE connection per table per client
- Clean up on `req.on('close')`
- Handle multiple clients per table

**Frontend:**
- One `EventSource` per table
- Automatic reconnection with exponential backoff
- Clean up on component unmount

### Error Handling

**Backend:**
- Log errors, don't crash
- Send error events to client if needed
- Handle database connection errors gracefully

**Frontend:**
- Log errors, continue processing
- Show connection status to user
- Fallback to polling if SSE fails

---

## Progress Tracking

- [ ] Phase 1: Database Schema Changes
- [ ] Phase 2: PostgreSQL LISTEN/NOTIFY Setup
- [ ] Phase 3: Backend SSE Endpoint
- [ ] Phase 4: Frontend Event Queue
- [ ] Phase 5: Frontend SSE Hook
- [ ] Phase 6: Frontend Integration
- [ ] Phase 7: Testing & Validation
- [ ] Phase 8: Migration & Cleanup

---

## Notes & Considerations

### Performance
- LISTEN/NOTIFY eliminates polling overhead
- `tableId` index makes queries efficient
- Sequential processing prevents race conditions

### Scalability
- Each client has one SSE connection per table
- PostgreSQL handles NOTIFY efficiently
- Consider connection limits (browsers limit ~6 SSE connections per domain)

### Security
- Validate `tableId` in endpoint
- Validate `lastEventId` (prevent negative, too large)
- Rate limiting if needed

### Monitoring
- Log SSE connections/disconnections
- Track event processing times
- Monitor queue sizes
- Alert on high error rates

---

## Future Enhancements

- [ ] Add event filtering (only subscribe to specific event types)
- [ ] Add event batching (send multiple events in one SSE message)
- [ ] Add compression for large payloads
- [ ] Add authentication/authorization for SSE endpoint
- [ ] Add metrics/analytics for event streaming

---

## Chat Feature Considerations

### Option 1: SSE Retrofit (Not Recommended)

**Approach:**
- Receive chat messages via SSE (server → client)
- Send chat messages via REST API (POST `/api/tables/:tableId/chat`)

**Pros:**
- Reuses existing SSE infrastructure
- Simple to implement
- No additional connection needed

**Cons:**
- Higher latency (HTTP overhead per message)
- Not ideal for high-frequency chat
- Two-way communication feels awkward

**Verdict:** Works but not optimal for real-time chat.

### Option 2: WebSockets for Chat (Recommended)

**Approach:**
- Use SSE for table events (hand_start, bet, etc.)
- Use WebSockets for chat (bidirectional, low latency)
- Two separate connections: one SSE, one WebSocket

**Pros:**
- True bidirectional communication
- Lower latency (no HTTP overhead)
- Better for high-frequency messages
- Clean separation of concerns

**Cons:**
- More complex (two connection types to manage)
- Requires WebSocket server setup

**Implementation:**
```typescript
// Frontend: Two connections
const eventSource = new EventSource('/api/tables/1/events'); // SSE for events
const chatSocket = new WebSocket('wss://api.example.com/tables/1/chat'); // WS for chat

// Backend: Two endpoints
app.get('/api/tables/:tableId/events', ...); // SSE endpoint
app.ws('/api/tables/:tableId/chat', ...); // WebSocket endpoint
```

**Verdict:** Best approach for real-time chat.

### Option 3: Full WebSocket Migration (Future Consideration)

**Approach:**
- Migrate everything to WebSockets (events + chat)

**Pros:**
- Single connection type
- Lower latency for everything
- More flexible

**Cons:**
- Major refactor required
- More complex connection management
- Overkill if chat is the only bidirectional need

**Verdict:** Consider if you need more bidirectional features later.

### Recommendation

**For now:** Use SSE for table events (current plan)

**When adding chat:** Add WebSockets for chat only (hybrid approach)

**Rationale:**
- SSE is perfect for one-way event streaming
- WebSockets are perfect for bidirectional chat
- Hybrid approach gives you the best of both worlds
- Minimal refactoring needed (just add WebSocket endpoint)

---

## HTTPS/TLS Security Considerations

### SSE over HTTPS

**How it works:**
- Use `https://` URLs: `https://api.example.com/api/tables/1/events`
- EventSource automatically handles TLS
- No code changes needed

**Example:**
```typescript
// Frontend - works automatically with HTTPS
const eventSource = new EventSource('https://api.example.com/api/tables/1/events');
```

**Security:**
- ✅ End-to-end encrypted
- ✅ Certificate validation handled by browser
- ✅ No additional configuration needed

### WebSockets over HTTPS (WSS)

**How it works:**
- Use `wss://` protocol: `wss://api.example.com/tables/1/chat`
- Requires protocol upgrade: HTTP → WSS
- Still encrypted end-to-end

**Example:**
```typescript
// Frontend - use wss:// for secure WebSocket
const chatSocket = new WebSocket('wss://api.example.com/tables/1/chat');
```

**Backend (Express with ws library):**
```typescript
import { WebSocketServer } from 'ws';
import https from 'https';
import fs from 'fs';

// Load SSL certificates
const server = https.createServer({
  cert: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem'),
});

const wss = new WebSocketServer({ server });
```

**Security:**
- ✅ End-to-end encrypted (same as HTTPS)
- ✅ Certificate validation handled by browser
- ✅ Requires SSL certificate setup on server

### Comparison

| Feature | SSE (HTTPS) | WebSocket (WSS) |
|---------|-------------|-----------------|
| **URL Format** | `https://` | `wss://` |
| **Encryption** | ✅ TLS/SSL | ✅ TLS/SSL |
| **Certificate** | Same as HTTPS | Same as HTTPS |
| **Browser Support** | ✅ Native | ✅ Native |
| **Code Changes** | None needed | Use `wss://` instead of `ws://` |
| **Server Setup** | Standard HTTPS | Standard HTTPS + WebSocket upgrade |

### Migration Path

**Current (HTTP):**
```typescript
// Development
const eventSource = new EventSource('http://localhost:3000/api/tables/1/events');
```

**Production (HTTPS):**
```typescript
// Production - just change URL, EventSource handles TLS
const eventSource = new EventSource('https://api.example.com/api/tables/1/events');
```

**No code changes needed** - just use HTTPS URLs in production!

### Best Practices

1. **Always use HTTPS/WSS in production**
   - Encrypts all traffic
   - Prevents man-in-the-middle attacks
   - Required for modern browsers (mixed content warnings)

2. **Use environment variables for URLs**
   ```typescript
   const backendUrl = import.meta.env.VITE_BACKEND_URL; // https://api.example.com
   const eventSource = new EventSource(`${backendUrl}/api/tables/1/events`);
   ```

3. **Handle certificate errors gracefully**
   - In development: may use self-signed certificates
   - In production: use valid SSL certificates (Let's Encrypt, etc.)

4. **Test both HTTP and HTTPS**
   - Development: HTTP (localhost)
   - Production: HTTPS (real domain)

---

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [PostgreSQL LISTEN/NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
- [Prisma Pulse](https://www.prisma.io/docs/orm/prisma-pulse) (future consideration)

