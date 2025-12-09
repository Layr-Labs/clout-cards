/**
 * Lobby Chat Routes
 *
 * Handles real-time chat endpoints for the game lobby (/play page).
 * Chat messages are ephemeral (not stored in database) and broadcast via SSE.
 * Unlike table chat, lobby chat is always active and has no table association.
 */

import { Router, Request, Response } from 'express';
import { requireTwitterAuth } from '../middleware/twitterAuth';
import { sendChatMessage, LOBBY_CHANNEL_ID, type ChatSender } from '../services/chat';
import { getTwitterUserInfo } from '../services/twitter';
import { sendErrorResponse, ValidationError } from '../utils/errorHandler';

const router = Router();

/**
 * POST /api/lobby/chat
 *
 * Sends a chat message to all connected clients in the lobby.
 * Messages are ephemeral (not stored in database) and broadcast via SSE.
 *
 * Auth:
 * - Requires Twitter authentication (user must be fully logged in)
 *
 * Request:
 * - Body:
 *   - message: string (max 500 characters)
 * - Query:
 *   - walletAddress: string (sender's wallet address)
 * - Headers:
 *   - X-Twitter-Access-Token: <token>
 *
 * Response:
 * - 200: { success: true }
 * - 400: Invalid message
 * - 401: Not authenticated
 *
 * @param req - Express request object with twitterAccessToken attached
 * @param res - Express response object
 */
router.post('/chat', requireTwitterAuth(), async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    // Validate message
    if (!message || typeof message !== 'string') {
      throw new ValidationError('Message is required');
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      throw new ValidationError('Message cannot be empty');
    }

    if (trimmedMessage.length > 500) {
      throw new ValidationError('Message exceeds maximum length of 500 characters');
    }

    // Get Twitter access token from authenticated request
    const twitterAccessToken = (req as Request & { twitterAccessToken: string }).twitterAccessToken;

    // Fetch Twitter user info
    const twitterUser = await getTwitterUserInfo(twitterAccessToken);

    // Create sender info
    const sender: ChatSender = {
      walletAddress: req.query.walletAddress as string || 'unknown',
      twitterHandle: `@${twitterUser.username}`,
      twitterAvatarUrl: twitterUser.profile_image_url || null,
    };

    // Send chat message to lobby channel (broadcasts to all SSE subscribers, no DB write)
    sendChatMessage(LOBBY_CHANNEL_ID, sender, trimmedMessage);

    res.status(200).json({ success: true });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to send lobby chat message');
  }
});

export default router;

