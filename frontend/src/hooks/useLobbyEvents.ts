/**
 * React hook for subscribing to lobby events via Server-Sent Events (SSE)
 *
 * This hook manages an SSE connection to `/lobby/events` and processes
 * chat messages for the game lobby. Simpler than useTableEvents since
 * lobby only handles chat (no game events with event IDs).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getBackendUrl } from '../config/env';
import type { ChatMessage } from '../services/chat';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface UseLobbyEventsOptions {
  /** Handler called when a chat message is received */
  onChatMessage: (message: ChatMessage) => void;
  /** Whether the SSE connection should be active */
  enabled?: boolean;
}

export interface UseLobbyEventsReturn {
  /** Current connection state */
  connectionState: ConnectionState;
}

const MAX_RECONNECT_DELAY = 5 * 60 * 1000;
const INITIAL_RECONNECT_DELAY = 1000;

/**
 * Hook for subscribing to lobby SSE events (chat only)
 *
 * @param options - Configuration options
 * @returns Connection state information
 *
 * @example
 * ```tsx
 * const { connectionState } = useLobbyEvents({
 *   onChatMessage: (msg) => setChatMessages(prev => [...prev, msg]),
 *   enabled: true,
 * });
 * ```
 */
export function useLobbyEvents(options: UseLobbyEventsOptions): UseLobbyEventsReturn {
  const { onChatMessage, enabled = true } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  // Stable callback reference
  const onChatMessageRef = useRef(onChatMessage);
  useEffect(() => {
    onChatMessageRef.current = onChatMessage;
  }, [onChatMessage]);

  // SSE connection effect
  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionState('disconnected');
      return;
    }

    console.log('[useLobbyEvents] Setting up SSE connection');

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
    const url = `${backendUrl}/lobby/events`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    let hasReceivedMessage = false;

    eventSource.onmessage = (event: MessageEvent) => {
      if (!hasReceivedMessage) {
        hasReceivedMessage = true;
        setConnectionState('connected');
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        console.log('[useLobbyEvents] Connected to lobby events stream');
      }

      try {
        const payload = JSON.parse(event.data);

        if (payload.kind === 'chat_message') {
          console.log('[useLobbyEvents] Chat message received', {
            messageId: payload.messageId,
          });
          onChatMessageRef.current(payload as ChatMessage);
        }
      } catch (error) {
        console.error('[useLobbyEvents] Error parsing event', {
          error,
          data: event.data,
        });
      }
    };

    eventSource.onerror = () => {
      console.error('[useLobbyEvents] SSE connection error', {
        readyState: eventSource.readyState,
      });

      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionState('error');

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Schedule reconnection
        if (enabled) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );

          console.log(`[useLobbyEvents] Reconnecting in ${delay}ms`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (eventSourceRef.current === null && enabled) {
              setConnectionState('disconnected');
            }
          }, delay);
        }
      }
    };

    // Cleanup
    return () => {
      console.log('[useLobbyEvents] Cleaning up SSE connection');
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [enabled]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useLobbyEvents] Component unmounting - final cleanup');
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
  };
}

