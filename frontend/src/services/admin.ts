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
 * Player balance at a specific table
 */
export interface TablePlayerBalance {
  /** Wallet address */
  address: string;
  /** Seat number at the table */
  seatNumber: number;
  /** Balance in gwei */
  balanceGwei: string;
}

/**
 * Table balance breakdown
 */
export interface TableBalance {
  /** Table ID */
  tableId: number;
  /** Table name */
  tableName: string;
  /** Players sitting at this table */
  players: TablePlayerBalance[];
  /** Total balance at this table in gwei */
  totalGwei: string;
}

/**
 * Solvency check result from the backend
 */
export interface SolvencyResult {
  /** Total escrow balance across all players (in gwei) - funds not at tables */
  totalEscrowGwei: string;
  /** Total table balance across all active sessions (in gwei) - funds at tables */
  totalTableBalanceGwei: string;
  /** Total liabilities = escrow + table balances (what contract must cover) */
  totalLiabilitiesGwei: string;
  /** Contract ETH balance (in gwei) */
  contractBalanceGwei: string;
  /** Whether the contract has sufficient funds to cover all liabilities */
  isSolvent: boolean;
  /** Shortfall amount in gwei if insolvent, null if solvent */
  shortfallGwei: string | null;
  /** Breakdown of escrow balances */
  escrowBreakdown: {
    /** Number of players with escrow balances */
    playerCount: number;
    /** List of individual escrow balances */
    players: PlayerBalance[];
  };
  /** Breakdown of table balances */
  tableBreakdown: {
    /** Number of tables with active sessions */
    tableCount: number;
    /** List of table balances */
    tables: TableBalance[];
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

/**
 * Result of a single event reprocess attempt
 */
export interface ReprocessedEvent {
  /** Event type */
  type: 'deposit' | 'withdrawal';
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
  /** Player wallet address */
  player: string;
  /** Amount in gwei */
  amountGwei: string;
  /** Withdrawal nonce (only for withdrawals) */
  nonce?: string;
  /** Processing status */
  status: 'processed' | 'skipped' | 'error';
  /** Reason for skip or error */
  reason?: string;
}

/**
 * Result of reprocessing events from a block range
 */
export interface ReprocessEventsResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Starting block number that was queried */
  fromBlock: number;
  /** Ending block number that was queried */
  toBlock: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Number of deposits that were processed */
  depositsProcessed: number;
  /** Number of deposits that were skipped (already processed) */
  depositsSkipped: number;
  /** Number of withdrawals that were processed */
  withdrawalsProcessed: number;
  /** Number of withdrawals that were skipped (already processed) */
  withdrawalsSkipped: number;
  /** Number of errors encountered */
  errors: number;
  /** List of individual event results */
  events: ReprocessedEvent[];
}

/**
 * Input for reprocessing events
 */
export interface ReprocessEventsInput {
  /** Starting block number (inclusive) */
  fromBlock: number;
  /** Ending block number (inclusive), defaults to latest if not provided */
  toBlock?: number;
  /** If true, preview what would be processed without making changes */
  dryRun: boolean;
}

/**
 * Reprocesses contract events (Deposited, WithdrawalExecuted) from a specified block range
 *
 * POST /admin/reprocessEvents
 *
 * Auth:
 * - Requires admin signature authentication
 *
 * Request:
 * - Query params: adminAddress
 * - Headers: Authorization (signature)
 * - Body: { fromBlock: number, toBlock?: number, dryRun: boolean }
 *
 * Response:
 * - 200: ReprocessEventsResult
 * - 400: Invalid parameters
 * - 401: Unauthorized
 * - 500: Server error
 *
 * @param input - Reprocess input parameters
 * @param signature - Admin session signature
 * @param adminAddress - Admin wallet address
 * @returns Promise that resolves to the reprocess result
 * @throws {Error} If the request fails
 */
export async function reprocessEvents(
  input: ReprocessEventsInput,
  signature: string,
  adminAddress: string
): Promise<ReprocessEventsResult> {
  return apiClient<ReprocessEventsResult>('/admin/reprocessEvents', {
    method: 'POST',
    requireAuth: true,
    signature,
    adminAddress,
    body: JSON.stringify(input),
  });
}

