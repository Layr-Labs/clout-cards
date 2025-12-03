/**
 * React hook for subscribing to table events via Server-Sent Events (SSE)
 *
 * This hook manages an SSE connection to `/api/tables/:tableId/events` and
 * processes events sequentially using an EventQueue. It handles reconnection
 * with exponential backoff and tracks connection state.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Sequential event processing via EventQueue
 * - Connection state tracking
 * - Event ID tracking for seamless reconnection
 * - Cleanup on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EventQueue, TableEvent, EventHandler } from '../utils/eventQueue';
import { getBackendUrl } from '../config/env';

/**
 * Connection state for the SSE stream
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Options for useTableEvents hook
 */
export interface UseTableEventsOptions {
  /**
   * Table ID to subscribe to events for
   */
  tableId: number | null | undefined;

  /**
   * Event handler function called for each event
   * Events are processed sequentially, one at a time
   */
  onEvent: EventHandler;

  /**
   * Whether the hook is enabled (default: true)
   * When false, the connection is not established
   */
  enabled?: boolean;

  /**
   * Last event ID to start from (for reconnection)
   * If provided, events with eventId <= lastEventId will be skipped
   */
  lastEventId?: number;
}

/**
 * Return value from useTableEvents hook
 */
export interface UseTableEventsReturn {
  /**
   * Current connection state
   */
  connectionState: ConnectionState;

  /**
   * Last processed event ID
   */
  lastProcessedEventId: number;

  /**
   * Current queue size (number of events waiting to be processed)
   */
  queueSize: number;

  /**
   * Whether events are currently being processed
   */
  isProcessing: boolean;
}

/**
 * Maximum reconnection delay in milliseconds (5 minutes)
 */
const MAX_RECONNECT_DELAY = 5 * 60 * 1000;

/**
 * Initial reconnection delay in milliseconds (1 second)
 */
const INITIAL_RECONNECT_DELAY = 1000;

/**
 * React hook for subscribing to table events via SSE
 *
 * Establishes an SSE connection to the backend and processes events sequentially
 * using an EventQueue. Handles reconnection automatically with exponential backoff.
 *
 * @param options - Hook configuration options
 * @returns Connection state and queue information
 *
 * @example
 * ```typescript
 * const { connectionState, lastProcessedEventId } = useTableEvents({
 *   tableId: 1,
 *   enabled: !!tableId,
 *   lastEventId: currentHand?.lastEventId,
 *   onEvent: async (event) => {
 *     switch (event.payload.kind) {
 *       case 'hand_start':
 *         await handleHandStart(event.payload);
 *         break;
 *       case 'bet':
 *         await handleBet(event.payload);
 *         break;
 *     }
 *   },
 * });
 * ```
 */
export function useTableEvents(options: UseTableEventsOptions): UseTableEventsReturn {
  const { tableId, onEvent, enabled = true, lastEventId } = options;

  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastProcessedEventId, setLastProcessedEventId] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for managing connection and queue
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventQueueRef = useRef<EventQueue | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const lastEventIdRef = useRef(lastEventId || 0);
  const isMountedRef = useRef(true);

  // Update lastEventId ref when prop changes
  useEffect(() => {
    if (lastEventId !== undefined && lastEventId > lastEventIdRef.current) {
      lastEventIdRef.current = lastEventId;
    }
  }, [lastEventId]);

  // Wrapper handler that updates state
  const wrappedHandler = useCallback<EventHandler>(
    async (event: TableEvent) => {
      // Update last processed event ID
      setLastProcessedEventId(event.eventId);
      lastEventIdRef.current = event.eventId;

      // Call the user's handler
      await onEvent(event);
    },
    [onEvent]
  );

  // Create event queue
  useEffect(() => {
    if (!eventQueueRef.current) {
      eventQueueRef.current = new EventQueue(wrappedHandler);
    }

    // Update state periodically from queue
    const interval = setInterval(() => {
      if (eventQueueRef.current) {
        setQueueSize(eventQueueRef.current.getQueueSize());
        setIsProcessing(eventQueueRef.current.isProcessing());
        setLastProcessedEventId(eventQueueRef.current.getLastProcessedEventId());
      }
    }, 100); // Update every 100ms

    return () => {
      clearInterval(interval);
    };
  }, [wrappedHandler]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!tableId || !enabled || !isMountedRef.current) {
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState('connecting');

    try {
      const backendUrl = getBackendUrl();
      const url = new URL(`${backendUrl}/api/tables/${tableId}/events`);

      // Add lastEventId query parameter if available
      if (lastEventIdRef.current > 0) {
        url.searchParams.set('lastEventId', lastEventIdRef.current.toString());
      }

      const eventSource = new EventSource(url.toString());
      eventSourceRef.current = eventSource;

      // Track if we've received at least one message (indicates connection is established)
      let hasReceivedMessage = false;

      // Handle messages
      eventSource.onmessage = (event: MessageEvent) => {
        if (!isMountedRef.current || !eventQueueRef.current) {
          return;
        }

        // Mark connection as connected when we receive first message
        if (!hasReceivedMessage) {
          hasReceivedMessage = true;
          setConnectionState('connected');
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY; // Reset delay on successful connection
          console.log(`[useTableEvents] Connected to table ${tableId} events stream`);
        }

        try {
          // Parse event ID from the last event ID (EventSource tracks this)
          // EventSource automatically sets lastEventId from the "id:" line in SSE format
          const eventId = event.lastEventId ? parseInt(event.lastEventId, 10) : 0;

          // Validate event ID (must be a positive integer)
          if (isNaN(eventId) || eventId <= 0) {
            console.warn(
              '[useTableEvents] Received message without valid event ID:',
              event.lastEventId,
              event.data
            );
            return;
          }

          // Parse payload JSON
          const payload = JSON.parse(event.data);

          // Create TableEvent
          const tableEvent: TableEvent = {
            eventId,
            payload,
          };

          // Enqueue the event
          eventQueueRef.current.enqueue(tableEvent);
        } catch (error) {
          console.error('[useTableEvents] Error parsing event:', error, event.data);
        }
      };

      // Handle errors
      eventSource.onerror = (error: Event) => {
        if (!isMountedRef.current) {
          return;
        }

        console.error(`[useTableEvents] SSE connection error for table ${tableId}:`, error);
        setConnectionState('error');

        // Close the connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Schedule reconnection with exponential backoff
        if (isMountedRef.current && enabled) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );

          console.log(
            `[useTableEvents] Reconnecting to table ${tableId} events in ${delay}ms`
          );

          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isMountedRef.current && enabled) {
              connect();
            }
          }, delay);
        }
      };
    } catch (error) {
      console.error(`[useTableEvents] Error setting up SSE connection for table ${tableId}:`, error);
      setConnectionState('error');

      // Schedule reconnection
      if (isMountedRef.current && enabled) {
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_DELAY
        );

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current && enabled) {
            connect();
          }
        }, delay);
      }
    }
  }, [tableId, enabled]);

  // Establish connection when tableId or enabled changes
  useEffect(() => {
    if (tableId && enabled) {
      connect();
    } else {
      // Disconnect if disabled or no tableId
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionState('disconnected');
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [tableId, enabled, connect]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Close EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Clear reconnection timeout
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Clear event queue
      if (eventQueueRef.current) {
        eventQueueRef.current.clear();
        eventQueueRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
    lastProcessedEventId,
    queueSize,
    isProcessing,
  };
}

