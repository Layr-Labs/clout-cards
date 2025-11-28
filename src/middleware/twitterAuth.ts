/**
 * Twitter authentication middleware
 *
 * Provides middleware for protecting endpoints with Twitter OAuth token authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { getTwitterUserInfo } from '../services/twitter';

/**
 * Express middleware for Twitter authentication
 *
 * Extracts Twitter access token from X-Twitter-Access-Token header and verifies it.
 * If verification fails, returns 401. If successful, attaches twitterAccessToken
 * to req object and calls next().
 *
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.get('/protected', requireTwitterAuth(), (req, res) => {
 *   // req.twitterAccessToken is available here
 *   res.json({ message: 'Authenticated' });
 * });
 * ```
 */
export function requireTwitterAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract Twitter access token from header
    const twitterAccessToken = req.headers['x-twitter-access-token'] as string | undefined;

    if (!twitterAccessToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'X-Twitter-Access-Token header is required',
      });
      return;
    }

    // Verify Twitter token by attempting to get user info
    try {
      await getTwitterUserInfo(twitterAccessToken);
      
      // Attach Twitter access token to request for use in route handler
      (req as Request & { twitterAccessToken: string }).twitterAccessToken = twitterAccessToken;
      next();
    } catch (error) {
      console.error('Twitter authentication failed:', error);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Twitter access token',
      });
      return;
    }
  };
}

