/**
 * Admin service for frontend
 *
 * Provides functions to interact with the backend admin endpoints.
 */

/**
 * Gets the list of admin addresses from the backend
 *
 * @returns Promise that resolves to an array of admin addresses
 * @throws {Error} If the request fails
 */
export async function getAdminAddresses(): Promise<string[]> {
  // Backend runs on port 8000 by default
  // In production, this should be set via VITE_BACKEND_URL environment variable
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
  const url = `${backendUrl}/admins`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch admin addresses: ${response.status} ${response.statusText}`);
  }

  const admins: string[] = await response.json();
  return admins;
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

