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

/**
 * Response from resetting the leaderboard
 */
export interface ResetLeaderboardResponse {
  success: boolean;
  recordsDeleted: number;
}

/**
 * Resets the leaderboard by deleting all records from the leaderboard_stats table
 *
 * POST /admin/leaderboard/reset
 *
 * Auth:
 * - Requires admin signature authentication
 *
 * Request:
 * - Query params: adminAddress
 * - Headers: Authorization (signature)
 *
 * Response:
 * - 200: { success: true; recordsDeleted: number }
 * - 401: Unauthorized
 * - 500: Server error
 *
 * @param signature - Admin session signature
 * @param adminAddress - Admin wallet address
 * @returns Promise that resolves to the reset result
 * @throws {Error} If the request fails
 */
export async function resetLeaderboard(
  signature: string,
  adminAddress: string
): Promise<ResetLeaderboardResponse> {
  return apiClient<ResetLeaderboardResponse>('/admin/leaderboard/reset', {
    method: 'POST',
    requireAuth: true,
    signature,
    adminAddress,
  });
}

/**
 * Individual player escrow balance
 */
export interface PlayerBalance {
  /** Wallet address */
  address: string;
  /** Balance in gwei */
  balanceGwei: string;
}

/**
 * Solvency check result from the backend
 */
export interface SolvencyResult {
  /** Total escrow balance across all players (in gwei) */
  totalEscrowGwei: string;
  /** Contract ETH balance (in gwei) */
  contractBalanceGwei: string;
  /** Whether the contract has sufficient funds to cover all escrow balances */
  isSolvent: boolean;
  /** Shortfall amount in gwei if insolvent, null if solvent */
  shortfallGwei: string | null;
  /** Breakdown of individual player balances */
  breakdown: {
    /** Number of players with escrow balances */
    playerCount: number;
    /** List of individual player balances */
    players: PlayerBalance[];
  };
}

/**
 * Gets solvency information comparing escrow balances to contract balance
 *
 * GET /api/accounting/solvency
 *
 * Auth:
 * - Requires admin signature authentication
 *
 * Request:
 * - Query params: adminAddress
 * - Headers: Authorization (signature)
 *
 * Response:
 * - 200: SolvencyResult
 * - 401: Unauthorized
 * - 500: Server error
 *
 * @param signature - Admin session signature
 * @param adminAddress - Admin wallet address
 * @returns Promise that resolves to the solvency result
 * @throws {Error} If the request fails
 */
export async function getAccountingSolvency(
  signature: string,
  adminAddress: string
): Promise<SolvencyResult> {
  return apiClient<SolvencyResult>('/api/accounting/solvency', {
    requireAuth: true,
    signature,
    adminAddress,
  });
}

