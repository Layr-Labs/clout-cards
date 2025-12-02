/**
 * PostgreSQL LISTEN/NOTIFY event notification handler
 *
 * Provides real-time event notifications using PostgreSQL's LISTEN/NOTIFY feature.
 * When a new event is inserted into the events table, a notification is sent
 * that can be received by SSE connections without polling.
 *
 * This module manages a dedicated PostgreSQL client connection for listening
 * to notifications, separate from Prisma's connection pool.
 */

import { Client } from 'pg';
import { constructDatabaseUrl } from '../config/database';

/**
 * Notification data structure
 */
export interface EventNotification {
  eventId: number;
  tableId: number | null;
  kind: string;
}

/**
 * Global PostgreSQL client for LISTEN/NOTIFY
 * 
 * This is a separate connection from Prisma's connection pool, dedicated
 * to listening for notifications. It's kept alive for the lifetime of the app.
 */
let pgClient: Client | null = null;
let isListening = false;

/**
 * Gets or creates the PostgreSQL client for notifications
 *
 * Creates a new client connection if one doesn't exist, connects it,
 * and sets up the LISTEN for the 'new_event' channel.
 *
 * @returns Promise that resolves to the PostgreSQL client
 * @throws {Error} If connection fails
 */
async function getPgClient(): Promise<Client> {
  if (pgClient && isListening) {
    return pgClient;
  }

  const databaseUrl = constructDatabaseUrl();
  pgClient = new Client({ connectionString: databaseUrl });

  // Handle connection errors
  pgClient.on('error', (err) => {
    console.error('[EventNotifier] PostgreSQL client error:', err);
    // Don't throw - let the app continue, but log the error
    // The connection will be re-established on next use
  });

  await pgClient.connect();
  console.log('[EventNotifier] Connected to PostgreSQL for LISTEN/NOTIFY');

  // Start listening for notifications
  if (!isListening) {
    await pgClient.query('LISTEN new_event');
    isListening = true;
    console.log('[EventNotifier] Listening on channel "new_event"');
  }

  return pgClient;
}

/**
 * Callback registry for event notifications
 * 
 * Stores multiple callbacks that can be registered/unregistered per SSE connection
 */
const notificationCallbacks = new Set<(notification: EventNotification) => void>();

/**
 * Sets up global event notification listener (called once on server startup)
 *
 * Sets up a single notification handler that distributes notifications to all
 * registered callbacks. This is more efficient than setting up separate handlers
 * for each SSE connection.
 *
 * @throws {Error} If connection fails
 */
export async function initializeEventNotifier(): Promise<void> {
  const client = await getPgClient();

  // Set up single notification handler that distributes to all callbacks
  client.on('notification', (msg) => {
    if (msg.channel === 'new_event') {
      try {
        const data = JSON.parse(msg.payload || '{}') as EventNotification;
        // Distribute to all registered callbacks
        notificationCallbacks.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error('[EventNotifier] Error in notification callback:', error);
          }
        });
      } catch (error) {
        console.error('[EventNotifier] Failed to parse notification payload:', error, msg.payload);
      }
    }
  });
}

/**
 * Registers a callback to receive event notifications
 *
 * The callback will be called whenever a new event is inserted into the events table.
 * Multiple callbacks can be registered (e.g., one per SSE connection).
 *
 * @param callback - Function to call when a new event notification is received
 * @returns Function to unregister the callback
 *
 * @example
 * ```typescript
 * const unsubscribe = registerEventCallback((notification) => {
 *   console.log('New event:', notification.eventId);
 * });
 * // Later, when done:
 * unsubscribe();
 * ```
 */
export function registerEventCallback(
  callback: (notification: EventNotification) => void
): () => void {
  notificationCallbacks.add(callback);
  return () => {
    notificationCallbacks.delete(callback);
  };
}

/**
 * Closes the PostgreSQL notification client connection
 *
 * Should be called during application shutdown to ensure clean disconnection.
 *
 * @returns Promise that resolves when connection is closed
 */
export async function closeEventNotifier(): Promise<void> {
  if (pgClient) {
    try {
      await pgClient.end();
    } catch (error) {
      console.error('[EventNotifier] Error closing client:', error);
    }
    pgClient = null;
    isListening = false;
    console.log('[EventNotifier] Closed PostgreSQL notification client');
  }
}

/**
 * Gets the current connection status
 *
 * @returns True if connected and listening, false otherwise
 */
export function isEventNotifierConnected(): boolean {
  return pgClient !== null && isListening;
}

