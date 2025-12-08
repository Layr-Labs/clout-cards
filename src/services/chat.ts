/**
 * In-Memory Chat Pub/Sub Service
 *
 * Provides real-time chat functionality for poker tables using in-memory pub/sub.
 * Chat messages are ephemeral - they are not persisted to the database and exist
 * only in memory and SSE streams.
 *
 * Architecture:
 * - Each table has a Set of active SSE response streams (subscribers)
 * - When a chat message is sent, it's broadcast to all subscribers for that table
 * - No database writes - messages are purely in-memory
 */

import { Response } from 'express';

/**
 * Chat message sender information
 */
export interface ChatSender {
  walletAddress: string;
  twitterHandle: string;
  twitterAvatarUrl: string | null;
}

/**
 * Chat message payload structure sent via SSE
 */
export interface ChatMessagePayload {
  kind: 'chat_message';
  tableId: number;
  message: string;
  sender: ChatSender;
  timestamp: string;
  messageId: string;
}

/**
 * Maximum message length in characters
 */
const MAX_MESSAGE_LENGTH = 500;

/**
 * In-memory storage for chat subscribers
 * Map<tableId, Set<Response>> - tracks active SSE connections per table
 */
const chatSubscribers = new Map<number, Set<Response>>();

/**
 * Counter for generating unique message IDs (in-memory only)
 */
let messageIdCounter = 0;

/**
 * Generates a unique message ID for chat messages
 *
 * Uses a combination of timestamp and counter to ensure uniqueness.
 * This is only for frontend tracking purposes (not persisted).
 *
 * @returns Unique message ID string
 */
function generateMessageId(): string {
  messageIdCounter += 1;
  return `chat_${Date.now()}_${messageIdCounter}`;
}

/**
 * Registers an SSE connection for chat message broadcasts
 *
 * Adds the response stream to the subscribers set for the given table.
 * Returns an unsubscribe function that should be called when the connection closes.
 *
 * @param tableId - The poker table ID to subscribe to
 * @param res - Express Response object (SSE stream)
 * @returns Unsubscribe function to call on connection close
 *
 * @example
 * ```typescript
 * const unsubscribeChat = subscribeToChat(tableId, res);
 * req.on('close', () => {
 *   unsubscribeChat();
 * });
 * ```
 */
export function subscribeToChat(tableId: number, res: Response): () => void {
  // Get or create the subscribers set for this table
  if (!chatSubscribers.has(tableId)) {
    chatSubscribers.set(tableId, new Set());
  }

  const subscribers = chatSubscribers.get(tableId)!;
  subscribers.add(res);

  console.log(`[Chat] Subscriber added for table ${tableId}. Total: ${subscribers.size}`);

  // Return unsubscribe function
  return () => {
    subscribers.delete(res);
    console.log(`[Chat] Subscriber removed for table ${tableId}. Total: ${subscribers.size}`);

    // Clean up empty sets to prevent memory leaks
    if (subscribers.size === 0) {
      chatSubscribers.delete(tableId);
    }
  };
}

/**
 * Broadcasts a chat message to all subscribers for a table
 *
 * Sends the message payload to all active SSE connections for the given table.
 * Handles closed connections gracefully by removing them from the subscribers set.
 *
 * @param tableId - The poker table ID to broadcast to
 * @param payload - The chat message payload to broadcast
 */
export function broadcastChatMessage(tableId: number, payload: ChatMessagePayload): void {
  const subscribers = chatSubscribers.get(tableId);

  if (!subscribers || subscribers.size === 0) {
    console.log(`[Chat] No subscribers for table ${tableId}, message not broadcast`);
    return;
  }

  const sseMessage = `id: ${payload.messageId}\ndata: ${JSON.stringify(payload)}\n\n`;

  // Track connections to remove (closed/errored)
  const toRemove: Response[] = [];

  subscribers.forEach((res) => {
    try {
      // Check if connection is still open
      if (res.writableEnded || res.closed) {
        toRemove.push(res);
        return;
      }

      res.write(sseMessage);
    } catch (error) {
      console.error(`[Chat] Error writing to subscriber for table ${tableId}:`, error);
      toRemove.push(res);
    }
  });

  // Clean up closed connections
  toRemove.forEach((res) => {
    subscribers.delete(res);
  });

  if (toRemove.length > 0) {
    console.log(`[Chat] Removed ${toRemove.length} closed connections for table ${tableId}`);
  }

  console.log(`[Chat] Broadcast message to ${subscribers.size} subscribers for table ${tableId}`);
}

/**
 * Sends a chat message to all subscribers for a table
 *
 * Validates the message, creates the payload, and broadcasts to all SSE subscribers.
 * This function does NOT write to the database - messages are ephemeral.
 *
 * @param tableId - The poker table ID to send the message to
 * @param sender - Information about the message sender (wallet, Twitter handle/avatar)
 * @param message - The chat message text
 *
 * @throws {Error} If message is empty or exceeds maximum length
 *
 * @example
 * ```typescript
 * sendChatMessage(1, {
 *   walletAddress: '0x123...',
 *   twitterHandle: '@user',
 *   twitterAvatarUrl: 'https://...'
 * }, 'Hello everyone!');
 * ```
 */
export function sendChatMessage(
  tableId: number,
  sender: ChatSender,
  message: string
): void {
  // Validate message
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    throw new Error('Message cannot be empty');
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Create chat message payload
  const payload: ChatMessagePayload = {
    kind: 'chat_message',
    tableId,
    message: trimmedMessage,
    sender,
    timestamp: new Date().toISOString(),
    messageId: generateMessageId(),
  };

  // Broadcast to all subscribers (no database write)
  broadcastChatMessage(tableId, payload);
}

/**
 * Gets the number of active subscribers for a table
 *
 * Useful for debugging and monitoring.
 *
 * @param tableId - The poker table ID
 * @returns Number of active subscribers
 */
export function getSubscriberCount(tableId: number): number {
  return chatSubscribers.get(tableId)?.size ?? 0;
}

/**
 * Gets the total number of active chat connections across all tables
 *
 * Useful for monitoring server load.
 *
 * @returns Total number of active chat subscribers
 */
export function getTotalSubscriberCount(): number {
  let total = 0;
  chatSubscribers.forEach((subscribers) => {
    total += subscribers.size;
  });
  return total;
}

/**
 * System sender constant used for system messages
 */
const SYSTEM_SENDER: ChatSender = {
  walletAddress: 'system',
  twitterHandle: 'System',
  twitterAvatarUrl: null,
};

/**
 * Sends a system message to all subscribers for a table
 *
 * System messages are special announcements from the system (not from players).
 * They are displayed differently in the chat UI (centered, different styling).
 * Like regular chat messages, they are ephemeral and not persisted.
 *
 * @param tableId - The poker table ID to send the system message to
 * @param message - The system message text
 *
 * @example
 * ```typescript
 * // Send deactivation notice
 * sendSystemMessage(1, 'This table has been deactivated by an administrator.');
 * ```
 */
export function sendSystemMessage(tableId: number, message: string): void {
  // Create chat message payload with system sender
  const payload: ChatMessagePayload = {
    kind: 'chat_message',
    tableId,
    message,
    sender: SYSTEM_SENDER,
    timestamp: new Date().toISOString(),
    messageId: generateMessageId(),
  };

  // Broadcast to all subscribers (no database write)
  broadcastChatMessage(tableId, payload);

  console.log(`[Chat] System message sent to table ${tableId}: ${message}`);
}

