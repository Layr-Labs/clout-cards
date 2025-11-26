/**
 * Escrow balance service
 *
 * Provides functions for fetching player escrow balance from the backend API.
 */

import { getBackendUrl } from '../config/env';

/**
 * Gets the escrow balance for the current user's wallet
 *
 * @param walletAddress - Ethereum wallet address
 * @param signature - Session signature for authentication
 * @returns Escrow balance in gwei (as string)
 * @throws {Error} If the API request fails
 */
export async function getEscrowBalance(walletAddress: string, signature: string): Promise<string> {
  const backendUrl = getBackendUrl();
  const response = await fetch(
    `${backendUrl}/playerEscrowBalance?walletAddress=${encodeURIComponent(walletAddress)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${signature}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch escrow balance' }));
    throw new Error(error.message || 'Failed to fetch escrow balance');
  }

  const data = await response.json();
  return data.balanceGwei;
}

