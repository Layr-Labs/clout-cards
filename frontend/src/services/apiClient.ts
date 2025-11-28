/**
 * Centralized API client with consistent error handling
 *
 * Provides a wrapper around fetch with:
 * - Automatic error parsing
 * - Consistent error message extraction
 * - Type-safe request/response handling
 * - Support for authentication headers
 */

import { getBackendUrl } from '../config/env';

/**
 * Options for API client requests
 */
interface ApiClientOptions extends RequestInit {
  /**
   * Whether authentication is required (adds Authorization header if signature provided)
   */
  requireAuth?: boolean;
  /**
   * Session signature for wallet authentication
   */
  signature?: string;
  /**
   * Twitter access token for Twitter authentication
   */
  twitterToken?: string;
  /**
   * Wallet address to include as query parameter
   */
  walletAddress?: string;
  /**
   * Admin address to include as query parameter
   */
  adminAddress?: string;
}

/**
 * Makes an API request with consistent error handling
 *
 * @param endpoint - API endpoint path (relative to backend URL)
 * @param options - Request options including auth and custom fetch options
 * @returns Promise that resolves to the parsed JSON response
 * @throws {Error} If the request fails or returns an error status
 *
 * @example
 * ```typescript
 * // Simple GET request
 * const tables = await apiClient<PokerTable[]>('/pokerTables');
 *
 * // Authenticated request
 * const balance = await apiClient<EscrowBalanceState>(
 *   '/playerEscrowBalance',
 *   {
 *     requireAuth: true,
 *     signature: userSignature,
 *     walletAddress: userAddress
 *   }
 * );
 *
 * // POST request with body
 * const table = await apiClient<CreatedTable>(
 *   '/createTable',
 *   {
 *     method: 'POST',
 *     requireAuth: true,
 *     signature: adminSignature,
 *     body: JSON.stringify(tableData)
 *   }
 * );
 * ```
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const {
    requireAuth,
    signature,
    twitterToken,
    walletAddress,
    adminAddress,
    ...fetchOptions
  } = options;

  const backendUrl = getBackendUrl();
  const url = new URL(`${backendUrl}${endpoint}`);

  // Add query parameters
  if (walletAddress) {
    url.searchParams.set('walletAddress', walletAddress);
  }
  if (adminAddress) {
    url.searchParams.set('adminAddress', adminAddress);
  }

  // Build headers
  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');

  if (requireAuth && signature) {
    headers.set('Authorization', `Bearer ${signature}`);
  }

  if (twitterToken) {
    headers.set('X-Twitter-Access-Token', twitterToken);
  }

  // Make the request
  const response = await fetch(url.toString(), {
    ...fetchOptions,
    headers,
  });

  // Handle errors consistently
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message ||
        `API request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

