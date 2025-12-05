/**
 * Chat Service
 *
 * Provides API client functions for the real-time chat feature.
 * Chat messages are sent via REST API and received via SSE.
 */

import { apiClient } from './apiClient';

/**
 * Chat message sender information
 */
export interface ChatSender {
  walletAddress: string;
  twitterHandle: string;
  twitterAvatarUrl: string | null;
}

/**
 * Chat message received from SSE
 */
export interface ChatMessage {
  kind: 'chat_message';
  tableId: number;
  message: string;
  sender: ChatSender;
  timestamp: string;
  messageId: string;
}

/**
 * Response from sending a chat message
 */
interface SendChatResponse {
  success: boolean;
}

/**
 * Sends a chat message to a poker table
 *
 * POST /api/tables/:tableId/chat
 *
 * Auth:
 * - Requires Twitter authentication (fully logged in user)
 * - Requires wallet signature
 *
 * @param tableId - The poker table ID to send the message to
 * @param message - The chat message text (max 500 characters)
 * @param signature - Wallet signature for authentication
 * @param twitterToken - Twitter access token
 * @param walletAddress - Sender's wallet address
 *
 * @returns Promise that resolves to success response
 * @throws {Error} If the request fails or validation fails
 *
 * @example
 * ```typescript
 * await sendChatMessage(1, 'Hello everyone!', signature, twitterToken, '0x123...');
 * ```
 */
export async function sendChatMessage(
  tableId: number,
  message: string,
  signature: string,
  twitterToken: string,
  walletAddress: string
): Promise<SendChatResponse> {
  return apiClient<SendChatResponse>(`/api/tables/${tableId}/chat?walletAddress=${walletAddress}`, {
    method: 'POST',
    body: JSON.stringify({ message }),
    requireAuth: true,
    signature,
    twitterToken,
  });
}

