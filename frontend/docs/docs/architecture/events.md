# Real-time Events

Clout Cards uses Server-Sent Events (SSE) with PostgreSQL LISTEN/NOTIFY for real-time updates.

## Why SSE?

| Feature | SSE | WebSockets |
|---------|-----|------------|
| Direction | Server → Client | Bidirectional |
| Complexity | Simple | More complex |
| Reconnection | Built-in | Manual |
| Use case | Event streaming | Chat, gaming |

For poker, SSE is ideal:
- Game actions sent via REST API
- Updates streamed via SSE
- No need for bidirectional communication

## Event Flow

```
1. Player makes action (REST API)
      ↓
2. Backend processes action
      ↓
3. Event created in database
      ↓
4. PostgreSQL TRIGGER fires
      ↓
5. pg_notify('new_event', payload)
      ↓
6. Backend receives notification
      ↓
7. SSE broadcasts to subscribers
      ↓
8. Frontend receives and processes
```

## Event Types

### Game Events (stored in DB)

| Event | Description |
|-------|-------------|
| `hand_start` | New hand begins, blinds posted |
| `hand_action` | Player action (fold/call/raise/etc) |
| `community_cards` | Flop/turn/river dealt |
| `hand_end` | Hand complete, winners announced |
| `join_table` | Player sits down |
| `leave_table` | Player stands up |

### Ephemeral Events (in-memory only)

| Event | Description |
|-------|-------------|
| `chat_message` | Player chat message |

## Event Payload Structure

All events follow this structure:

```json
{
  "kind": "hand_action",
  "table": { "id": 1, "name": "Table 1" },
  "hand": { "id": 123, "round": "FLOP" },
  "action": {
    "type": "RAISE",
    "amount": "1000000000",
    "seatNumber": 3
  },
  "playerBalances": [
    { "seatNumber": 1, "tableBalanceGwei": "5000000000" },
    { "seatNumber": 3, "tableBalanceGwei": "4000000000" }
  ]
}
```

## SSE Endpoint

```
GET /api/tables/:tableId/events?lastEventId=0
```

### Query Parameters

| Param | Description |
|-------|-------------|
| `lastEventId` | Resume from this event ID (for reconnection) |

### Response Format

```
: connected

id: 1234
data: {"kind":"hand_start",...}

id: 1235
data: {"kind":"hand_action",...}

: heartbeat
```

## Frontend Processing

### Event Queue

Events are processed sequentially to ensure correct ordering:

```typescript
// utils/eventQueue.ts
class EventQueue {
  enqueue(event)     // Add to queue
  processQueue()     // Process one at a time
}
```

### Hook Usage

```typescript
useTableEvents({
  tableId: 1,
  enabled: true,
  lastEventId: 0,
  onEvent: async (event) => {
    // Handle event
  }
});
```

## Reconnection

The frontend handles disconnections automatically:

1. SSE connection drops
2. Exponential backoff (1s, 2s, 4s, ... up to 5min)
3. Reconnect with `lastEventId` to resume
4. Missed events are sent immediately
5. Continue streaming new events

## PostgreSQL Setup

```sql
-- Trigger function
CREATE FUNCTION notify_new_event() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('new_event', json_build_object(
    'eventId', NEW.event_id,
    'tableId', NEW.table_id,
    'kind', NEW.kind
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on events table
CREATE TRIGGER event_notify_trigger
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_event();
```

