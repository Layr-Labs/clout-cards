/**
 * Twitter OAuth routes
 *
 * Handles Twitter OAuth 2.0 authentication flow endpoints.
 * Separated from main index.ts for cleaner organization.
 */

import { Router, Request, Response } from 'express';
import {
  getTwitterAuthUrl,
  exchangeTwitterCode,
  getTwitterUserInfo,
  generateCodeVerifier,
  generateState,
} from '../services/twitter';
import { isProduction } from '../config/env';

/**
 * Router instance for Twitter OAuth routes
 */
const router = Router();

/**
 * Gets the frontend URL for redirects
 *
 * Uses FRONTEND_URL environment variable in production, defaults to localhost:5173
 * for development.
 *
 * @returns Frontend URL string
 */
function getFrontendUrl(): string {
  return isProduction()
    ? process.env.FRONTEND_URL || 'http://localhost:5173'
    : 'http://localhost:5173';
}

/**
 * Gets the backend URL for OAuth callbacks
 *
 * Twitter must redirect to the backend server (not frontend) because the backend
 * needs to exchange the authorization code for tokens using CLIENT_SECRET.
 *
 * Uses BACKEND_URL environment variable in production, defaults to localhost:8000
 * for development.
 *
 * @returns Backend URL string
 */
function getBackendUrl(): string {
  const port = process.env.APP_PORT || '8000';
  return isProduction()
    ? process.env.BACKEND_URL || `https://api.example.com`
    : `http://localhost:${port}`;
}

/**
 * In-memory store for OAuth state and code verifiers
 * In production, use Redis or a database for this
 */
const oauthSessions = new Map<string, { codeVerifier: string; state: string; timestamp: number }>();

/**
 * In-memory store for Twitter tokens keyed by temporary session ID
 * In production, use Redis or a database for this
 * Tokens are stored temporarily and can be retrieved once by the frontend
 */
const twitterTokenSessions = new Map<string, { accessToken: string; refreshToken: string; userInfo: { id: string; username: string; name: string; profile_image_url?: string }; timestamp: number }>();

// Clean up old token sessions (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of twitterTokenSessions.entries()) {
    if (now - session.timestamp > 5 * 60 * 1000) {
      twitterTokenSessions.delete(key);
    }
  }
}, 2 * 60 * 1000); // Run cleanup every 2 minutes

// Clean up old sessions (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of oauthSessions.entries()) {
    if (now - session.timestamp > 10 * 60 * 1000) {
      oauthSessions.delete(key);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

/**
 * GET /twitter/auth
 *
 * Initiates Twitter OAuth flow by redirecting user to Twitter authorization page.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - redirect_uri: string (optional) - Callback URL (defaults to frontend URL + /twitter/callback)
 *
 * Response:
 * - 302: Redirects to Twitter authorization page
 * - 400: { error: string; message: string } - Invalid request
 * - 500: { error: string; message: string } - Server error
 *
 * Side effects:
 * - Stores OAuth state and code verifier in session store
 * - Redirects user to Twitter for authorization
 */
router.get('/twitter/auth', (req: Request, res: Response): void => {
  try {
    const backendUrl = getBackendUrl();
    // Twitter MUST redirect to backend callback (not frontend) because backend needs CLIENT_SECRET
    // Always use backend URL for Twitter OAuth redirect_uri, ignore any frontend-provided redirect_uri
    const redirectUri = `${backendUrl}/twitter/callback`;
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    // Store state and code verifier (keyed by state)
    oauthSessions.set(state, {
      codeVerifier,
      state,
      timestamp: Date.now(),
    });

    const authUrl = getTwitterAuthUrl(redirectUri, state, codeVerifier);

    // Redirect to Twitter
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Twitter auth:', error);
    res.status(500).json({
      error: 'Failed to initiate Twitter authentication',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /twitter/callback
 *
 * Handles Twitter OAuth callback after user authorizes.
 * Exchanges authorization code for access token and user info.
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params:
 *   - code: string (required) - Authorization code from Twitter
 *   - state: string (required) - State parameter for CSRF protection
 *   - redirect_uri: string (optional) - Same redirect URI used in auth request
 *
 * Response:
 * - 302: Redirects to frontend with success/error in query params
 * - 400: { error: string; message: string } - Invalid code or state
 * - 500: { error: string; message: string } - Server error
 *
 * Side effects:
 * - Validates OAuth state
 * - Exchanges code for access token
 * - Retrieves user info from Twitter
 * - Redirects to frontend with user info in query params
 */
router.get('/twitter/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Authorization code is required',
      });
      return;
    }

    if (!state || typeof state !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'State parameter is required',
      });
      return;
    }

    // Verify state exists in session store
    const session = oauthSessions.get(state);
    if (!session) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Invalid or expired state parameter',
      });
      return;
    }

    // Remove session after use (one-time use)
    oauthSessions.delete(state);

    const backendUrl = getBackendUrl();
    // redirectUri must match what was sent to Twitter (always backend URL)
    const redirectUri = `${backendUrl}/twitter/callback`;

    // Exchange code for access token
    const { accessToken, refreshToken } = await exchangeTwitterCode(code, redirectUri, session.codeVerifier);

    // Get user info (this will cache it for future requests)
    // If rate limited, we'll handle it gracefully
    let userInfo;
    try {
      userInfo = await getTwitterUserInfo(accessToken);
    } catch (error) {
      // If rate limited during OAuth callback, log warning but don't fail
      // The user can still proceed, and we'll cache user info on next request
      if (error instanceof Error && error.message.includes('429')) {
        console.warn('⚠️  Twitter API rate limit hit during OAuth callback. User info will be fetched on next request.');
        // Create a placeholder user info - this shouldn't happen often
        throw new Error('Twitter API rate limit exceeded. Please try again in a few minutes.');
      }
      throw error;
    }

    // Generate temporary session ID for token retrieval
    const sessionId = generateState(64);

    // Store tokens and user info temporarily (one-time use)
    twitterTokenSessions.set(sessionId, {
      accessToken,
      refreshToken,
      userInfo,
      timestamp: Date.now(),
    });

    // Redirect to frontend with only session ID (no tokens in URL)
    const frontendUrl = getFrontendUrl();
    const frontendCallbackUrl = new URL(`${frontendUrl}/play`);
    frontendCallbackUrl.searchParams.set('twitter_session_id', sessionId);

    res.redirect(frontendCallbackUrl.toString());
  } catch (error) {
    console.error('Error handling Twitter callback:', error);
    const frontendUrl = getFrontendUrl();
    const frontendCallbackUrl = new URL(`${frontendUrl}/play`);
    frontendCallbackUrl.searchParams.set('twitter_error', error instanceof Error ? error.message : 'Unknown error');

    res.redirect(frontendCallbackUrl.toString());
  }
});

/**
 * GET /twitter/tokens
 *
 * Retrieves Twitter tokens and user info using a temporary session ID.
 * This is a one-time retrieval - tokens are deleted after being fetched.
 *
 * Auth:
 * - No authentication required (session ID provides security)
 *
 * Request:
 * - Query params:
 *   - session_id: string (required) - Temporary session ID from callback redirect
 *
 * Response:
 * - 200: { accessToken: string; refreshToken: string; userInfo: {...} }
 * - 400: { error: string; message: string } - Invalid or missing session_id
 * - 404: { error: string; message: string } - Session expired or not found
 * - 500: { error: string; message: string } - Server error
 */
router.get('/twitter/tokens', (req: Request, res: Response): void => {
  try {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'session_id query parameter is required',
      });
      return;
    }

    // Retrieve and delete tokens (one-time use)
    const tokenSession = twitterTokenSessions.get(session_id);
    if (!tokenSession) {
      res.status(404).json({
        error: 'Session not found',
        message: 'Session expired or invalid. Please try connecting again.',
      });
      return;
    }

    // Remove session after retrieval (one-time use)
    twitterTokenSessions.delete(session_id);

    res.status(200).json({
      accessToken: tokenSession.accessToken,
      refreshToken: tokenSession.refreshToken,
      userInfo: tokenSession.userInfo,
    });
  } catch (error) {
    console.error('Error retrieving Twitter tokens:', error);
    res.status(500).json({
      error: 'Failed to retrieve Twitter tokens',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /twitter/user
 *
 * Gets current Twitter user info from access token.
 *
 * Auth:
 * - Requires Twitter access token in Authorization header
 *
 * Request:
 * - Headers:
 *   - Authorization: string (required) - Twitter access token (Bearer token)
 *
 * Response:
 * - 200: { id: string; username: string; name: string; profile_image_url?: string }
 * - 401: { error: string; message: string } - Invalid or missing token
 * - 500: { error: string; message: string } - Server error
 */
router.get('/twitter/user', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header with Bearer token is required',
      });
      return;
    }

    const accessToken = authHeader.substring(7); // Remove "Bearer " prefix
    const userInfo = await getTwitterUserInfo(accessToken);

    res.status(200).json(userInfo);
  } catch (error) {
    console.error('Error getting Twitter user:', error);
    
    // Handle rate limiting specifically
    if (error instanceof Error && error.message.includes('429')) {
      res.status(429).json({
        error: 'RateLimitExceeded',
        message: 'Twitter API rate limit exceeded. Please try again later.',
      });
      return;
    }
    
    res.status(401).json({
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Invalid access token',
    });
  }
});

export default router;

