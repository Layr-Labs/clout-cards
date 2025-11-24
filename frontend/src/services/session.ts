/**
 * Session service for frontend
 *
 * Provides functions to interact with backend session endpoints.
 */

import { getBackendUrl } from '../config/env';

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

  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/sessionMessage?address=${encodeURIComponent(address)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to get session message: ${response.status} ${response.statusText}`
    );
  }

  const data: { message: string } = await response.json();
  return data.message;
}

