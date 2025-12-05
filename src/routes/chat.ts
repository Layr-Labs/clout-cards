/**
 * Chat Routes
 *
 * Handles real-time chat endpoints for poker tables.
 * Chat messages are ephemeral (not stored in database) and broadcast via SSE.
 */

import { Router, Request, Response } from 'express';
import { requireTwitterAuth } from '../middleware/twitterAuth';
import { sendChatMessage, type ChatSender } from '../services/chat';
import { getTwitterUserInfo } from '../services/twitter';
import { prisma } from '../db/client';
import { sendErrorResponse, ValidationError, NotFoundError } from '../utils/errorHandler';

const router = Router();

/**
 * POST /api/tables/:tableId/chat
 *
 * Sends a chat message to all connected clients for a poker table.
 * Messages are ephemeral (not stored in database) and broadcast via SSE.
 *
 * Auth:
 * - Requires Twitter authentication (user must be fully logged in)
 *
 * Request:
 * - Path params:
 *   - tableId: number (Table ID to send message to)
 * - Body:
 *   - message: string (max 500 characters)
 * - Headers:
 *   - X-Twitter-Access-Token: <token>
 *
 * Response:
 * - 200: { success: true }
 * - 400: Invalid table ID or message
 * - 401: Not authenticated
 * - 404: Table not found
 *
 * @param req - Express request object with twitterAccessToken attached
 * @param res - Express response object
 */
router.post('/:tableId/chat', requireTwitterAuth(), async (req: Request, res: Response): Promise<void> => {
  try {
    const tableId = parseInt(req.params.tableId, 10);
    const { message } = req.body;

    // Validate table ID
    if (isNaN(tableId)) {
      throw new ValidationError('Invalid table ID');
    }

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

    // Verify table exists and is active
    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      select: { id: true, isActive: true },
    });

    if (!table) {
      throw new NotFoundError('Table not found');
    }

    if (!table.isActive) {
      throw new ValidationError('Table is not active');
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

    // Send chat message (broadcasts to all SSE subscribers, no DB write)
    sendChatMessage(tableId, sender, trimmedMessage);

    res.status(200).json({ success: true });
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to send chat message');
  }
});

export default router;

