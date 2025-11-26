/**
 * Wallet authentication middleware
 *
 * Provides middleware for protecting endpoints with wallet signature-based authentication.
 * Similar to adminAuth but for regular user wallets.
 */

import { Request, Response, NextFunction } from 'express';
import { verifySessionSignature } from '../services/auth';

/**
 * Options for wallet authentication middleware
 */
export interface WalletAuthOptions {
  /**
   * Where to extract the wallet address from
   * - 'body': From request body (default)
   * - 'query': From query parameters
   * - 'header': From custom header (e.g., X-Wallet-Address)
   */
  addressSource?: 'body' | 'query' | 'header';
  /**
   * Custom header name if addressSource is 'header'
   * Defaults to 'X-Wallet-Address'
   */
  addressHeaderName?: string;
}

/**
 * Express middleware for wallet authentication
 *
 * Extracts signature from Authorization header and wallet address from request,
 * then verifies the wallet is authenticated. If verification fails, returns 401.
 * If successful, attaches walletAddress to req object and calls next().
 *
 * @param options - Configuration options for address extraction
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.get('/playerEscrowBalance', requireWalletAuth(), (req, res) => {
 *   // req.walletAddress is available here
 *   res.json({ balance: '1000000000' });
 * });
 * ```
 */
export function requireWalletAuth(options: WalletAuthOptions = {}) {
  const { addressSource = 'query', addressHeaderName = 'X-Wallet-Address' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract signature from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header with Bearer token (signature) is required',
      });
      return;
    }

    const signature = authHeader.substring(7); // Remove "Bearer " prefix

    // Extract wallet address based on source
    let walletAddress: string | undefined;

    if (addressSource === 'body') {
      walletAddress = req.body?.walletAddress;
    } else if (addressSource === 'query') {
      walletAddress = req.query?.walletAddress as string | undefined;
    } else if (addressSource === 'header') {
      const headerValue = req.headers[addressHeaderName.toLowerCase()];
      walletAddress = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }

    if (!walletAddress || typeof walletAddress !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: `walletAddress is required in ${addressSource}`,
      });
      return;
    }

    // Verify wallet authentication
    if (!verifySessionSignature(walletAddress, signature)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature or address mismatch',
      });
      return;
    }

    // Attach wallet address to request for use in route handler
    (req as Request & { walletAddress: string }).walletAddress = walletAddress;
    next();
  };
}

