/**
 * Admin authentication middleware
 *
 * Provides middleware and wrapper functions for protecting admin endpoints
 * with signature-based authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAdminAuth } from '../services/auth';

/**
 * Options for admin authentication middleware
 */
export interface AdminAuthOptions {
  /**
   * Where to extract the admin address from
   * - 'body': From request body (default)
   * - 'query': From query parameters
   * - 'header': From custom header (e.g., X-Admin-Address)
   */
  addressSource?: 'body' | 'query' | 'header';
  /**
   * Custom header name if addressSource is 'header'
   * Defaults to 'X-Admin-Address'
   */
  addressHeaderName?: string;
}

/**
 * Express middleware for admin authentication
 *
 * Extracts signature from Authorization header and admin address from request,
 * then verifies the admin is authenticated. If verification fails, returns 401.
 * If successful, attaches adminAddress to req object and calls next().
 *
 * @param options - Configuration options for address extraction
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.post('/admin/endpoint', requireAdminAuth(), (req, res) => {
 *   // req.adminAddress is available here
 *   res.json({ success: true });
 * });
 * ```
 */
export function requireAdminAuth(options: AdminAuthOptions = {}) {
  const { addressSource = 'body', addressHeaderName = 'X-Admin-Address' } = options;

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

    // Extract admin address based on source
    let adminAddress: string | undefined;

    if (addressSource === 'body') {
      adminAddress = req.body?.adminAddress;
    } else if (addressSource === 'query') {
      adminAddress = req.query?.adminAddress as string | undefined;
    } else if (addressSource === 'header') {
      const headerValue = req.headers[addressHeaderName.toLowerCase()];
      adminAddress = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }

    if (!adminAddress || typeof adminAddress !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: `adminAddress is required in ${addressSource}`,
      });
      return;
    }

    // Verify admin authentication
    if (!verifyAdminAuth(adminAddress, signature)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature or address is not an admin',
      });
      return;
    }

    // Attach admin address to request for use in route handler
    (req as Request & { adminAddress: string }).adminAddress = adminAddress;
    next();
  };
}

/**
 * Wrapper function for admin-protected route handlers
 *
 * This is an alternative to middleware - wraps a route handler function
 * and handles admin authentication before calling it.
 *
 * @param handler - Route handler function that receives req with adminAddress attached
 * @param options - Configuration options for address extraction
 * @returns Express route handler with admin auth built in
 *
 * @example
 * ```typescript
 * app.post('/admin/endpoint', withAdminAuth(async (req, res) => {
 *   const adminAddress = req.adminAddress; // Available here
 *   res.json({ success: true });
 * }));
 * ```
 */
export function withAdminAuth(
  handler: (req: Request & { adminAddress: string }, res: Response) => Promise<void> | void,
  options: AdminAuthOptions = {}
) {
  const middleware = requireAdminAuth(options);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    middleware(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      // Call the handler with the authenticated request
      Promise.resolve(handler(req as Request & { adminAddress: string }, res)).catch(next);
    });
  };
}

