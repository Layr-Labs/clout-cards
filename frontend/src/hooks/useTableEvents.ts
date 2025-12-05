/**
 * React hook for subscribing to table events via Server-Sent Events (SSE)
 *
 * This hook manages an SSE connection to `/api/tables/:tableId/events` and
 * processes events sequentially using an EventQueue. It handles reconnection
 * with exponential backoff and tracks connection state.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EventQueue } from '../utils/eventQueue';
import type { TableEvent, EventHandler } from '../utils/eventQueue';
import { getBackendUrl } from '../config/env';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface UseTableEventsOptions {
  tableId: number | null | undefined;
  onEvent: EventHandler;
  enabled?: boolean;
  lastEventId?: number;
}

export interface UseTableEventsReturn {
  connectionState: ConnectionState;
  lastProcessedEventId: number;
  queueSize: number;
  isProcessing: boolean;
}

const MAX_RECONNECT_DELAY = 5 * 60 * 1000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useTableEvents(options: UseTableEventsOptions): UseTableEventsReturn {
  const { tableId, onEvent, enabled = true, lastEventId } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastProcessedEventId, setLastProcessedEventId] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const eventQueueRef = useRef<EventQueue | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const lastEventIdRef = useRef(lastEventId || 0);

  // Update lastEventId ref when prop changes
  useEffect(() => {
    if (lastEventId !== undefined && lastEventId > lastEventIdRef.current) {
      lastEventIdRef.current = lastEventId;
    }
  }, [lastEventId]);

  // Wrapper handler
  const wrappedHandler = useCallback<EventHandler>(
    async (event: TableEvent) => {
      setLastProcessedEventId(event.eventId);
      lastEventIdRef.current = event.eventId;
      await onEvent(event);
    },
    [onEvent]
  );

  // Create event queue
  useEffect(() => {
    if (!eventQueueRef.current) {
      eventQueueRef.current = new EventQueue(wrappedHandler);
    }

    const interval = setInterval(() => {
      if (eventQueueRef.current) {
        setQueueSize(eventQueueRef.current.getQueueSize());
        setIsProcessing(eventQueueRef.current.isProcessing());
        setLastProcessedEventId(eventQueueRef.current.getLastProcessedEventId());
      }
    }, 100);

    return () => clearInterval(interval);
  }, [wrappedHandler]);

  // SSE connection effect
  useEffect(() => {
    if (!tableId || !enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionState('disconnected');
      return;
    }

    console.log('[useTableEvents] Setting up SSE connection', { tableId, lastEventId: lastEventIdRef.current });

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState('connecting');

    const backendUrl = getBackendUrl();
    const url = new URL(`${backendUrl}/api/tables/${tableId}/events`);

    if (lastEventIdRef.current > 0) {
      url.searchParams.set('lastEventId', lastEventIdRef.current.toString());
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    let hasReceivedMessage = false;

    eventSource.onmessage = (event: MessageEvent) => {
      if (!eventQueueRef.current) {
        return;
      }

      if (!hasReceivedMessage) {
        hasReceivedMessage = true;
        setConnectionState('connected');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        console.log(`[useTableEvents] Connected to table ${tableId} events stream`);
      }

      try {
        const payload = JSON.parse(event.data);

        // Chat messages have string IDs (ephemeral, no DB storage)
        // Game events have numeric IDs (from database, for reconnection)
        if (payload.kind === 'chat_message') {
          // Handle chat messages without requiring numeric event ID
          console.log('[useTableEvents] Chat message received from SSE', {
            messageId: payload.messageId,
            tableId,
          });

          const tableEvent: TableEvent = {
            eventId: 0, // Chat messages don't have numeric IDs
            payload,
          };

          eventQueueRef.current.enqueue(tableEvent);
          return;
        }

        // Game events require numeric event IDs
        const eventId = event.lastEventId ? parseInt(event.lastEventId, 10) : 0;

        if (isNaN(eventId) || eventId <= 0) {
          console.warn('[useTableEvents] Received message without valid event ID', {
            lastEventId: event.lastEventId,
            data: event.data,
            tableId,
          });
          return;
        }

        console.log('[useTableEvents] Event received from SSE', {
          eventId,
          kind: payload.kind,
          tableId,
        });

        const tableEvent: TableEvent = {
          eventId,
          payload,
        };

        eventQueueRef.current.enqueue(tableEvent);
      } catch (error) {
        console.error('[useTableEvents] Error parsing event', {
          error,
          data: event.data,
          tableId,
        });
      }
    };

    eventSource.onerror = () => {
      console.error('[useTableEvents] SSE connection error', {
        tableId,
        readyState: eventSource.readyState,
      });

      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionState('error');

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Schedule reconnection by re-running the effect
        if (enabled && tableId) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );

          console.log(`[useTableEvents] Reconnecting to table ${tableId} events in ${delay}ms`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            // Force effect to re-run by toggling a ref that's checked in the effect
            // Since we can't add connectionState to deps, we'll use a reconnection trigger
            if (eventSourceRef.current === null && enabled && tableId) {
              // Effect will re-run naturally when dependencies change
              // For now, manually trigger reconnection by closing and letting effect handle it
              // Actually, the effect should handle this - if eventSourceRef is null and enabled/tableId are set, it will reconnect
              // But we need to ensure the effect runs again. Let's use a state update to force re-render
              setConnectionState('disconnected');
            }
          }, delay);
        }
      }
    };

    // Cleanup
    return () => {
      console.log('[useTableEvents] Cleaning up SSE connection', { tableId });
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [tableId, enabled]); // Only re-run when tableId or enabled changes, not connectionState

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useTableEvents] Component unmounting - final cleanup');
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
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
