/**
 * Session service for frontend
 *
 * Provides functions to interact with backend session endpoints.
 */

import { apiClient } from './apiClient';

/**
 * Gets a session message for wallet signature authentication
 *
 * @param address - Ethereum address to generate message for
 * @returns Promise that resolves to the session message string
 * @throws {Error} If the request fails or address is invalid
 */
export async function getSessionMessage(address: string): Promise<string> {
  if (!address) {
    throw new Error('Address is required');
  }

  const data = await apiClient<{ message: string }>(`/sessionMessage?address=${encodeURIComponent(address)}`);
  return data.message;
}

