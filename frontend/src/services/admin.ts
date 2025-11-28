/**
 * Admin service for frontend
 *
 * Provides functions to interact with the backend admin endpoints.
 */

import { apiClient } from './apiClient';

/**
 * Gets the list of admin addresses from the backend
 *
 * @returns Promise that resolves to an array of admin addresses
 * @throws {Error} If the request fails
 */
export async function getAdminAddresses(): Promise<string[]> {
  return apiClient<string[]>('/admins');
}

/**
 * Checks if an address is an admin
 *
 * @param address - Ethereum address to check (will be normalized to lowercase)
 * @returns Promise that resolves to true if the address is an admin, false otherwise
 */
export async function isAdmin(address: string): Promise<boolean> {
  if (!address) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();
  const admins = await getAdminAddresses();
  
  // Normalize admin addresses for comparison
  const normalizedAdmins = admins.map(addr => addr.toLowerCase());
  
  return normalizedAdmins.includes(normalizedAddress);
}

