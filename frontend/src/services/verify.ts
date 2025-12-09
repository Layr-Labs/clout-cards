/**
 * Verify Service
 *
 * Provides functions to fetch platform verification data including
 * statistics, activity metrics, and paginated events for public verification.
 * All endpoints are public and do not require authentication.
 */

import { apiClient } from './apiClient';

// =============================================================================
// Types
// =============================================================================

/**
 * Platform-wide statistics for verification
 */
export interface VerifyStats {
  /** Total number of completed hands */
  handsPlayed: number;
  /** Total bet volume in gwei (as string for BigInt safety) */
  totalBetVolumeGwei: string;
  /** Total escrow funds (escrow + table balances) in gwei */
  totalEscrowFundsGwei: string;
  /** Contract balance on-chain in gwei */
  contractBalanceGwei: string;
  /** TEE's rake balance in gwei */
  teeRakeBalanceGwei: string;
}

/**
 * Hourly hands activity data point
 */
export interface HandsPerHour {
  /** ISO timestamp for the hour */
  hour: string;
  /** Number of hands completed in this hour */
  count: number;
}

/**
 * Hourly volume activity data point
 */
export interface VolumePerHour {
  /** ISO timestamp for the hour */
  hour: string;
  /** Bet volume in gwei for this hour */
  volumeGwei: string;
}

/**
 * Activity time-series data for last 48 hours
 */
export interface VerifyActivity {
  /** Hands completed per hour */
  handsPerHour: HandsPerHour[];
  /** Bet volume per hour */
  volumePerHour: VolumePerHour[];
}

/**
 * Event data with signature verification
 */
export interface VerifyEvent {
  /** Unique event ID */
  eventId: number;
  /** ISO timestamp when event was finalized */
  blockTs: string;
  /** Player address (if applicable) */
  player: string | null;
  /** Table ID (if applicable) */
  tableId: number | null;
  /** Event kind (deposit, withdraw, hand_start, etc.) */
  kind: string;
  /** Canonical JSON payload that was signed */
  payloadJson: string;
  /** EIP-712 digest of the payload */
  digest: string;
  /** Signature R component */
  sigR: string;
  /** Signature S component */
  sigS: string;
  /** Signature V component */
  sigV: number;
  /** Nonce (for withdrawal events) */
  nonce: string | null;
  /** TEE version that signed this event */
  teeVersion: number;
  /** TEE public key (address) that signed this event */
  teePubkey: string;
  /** ISO timestamp when event was ingested */
  ingestedAt: string;
  /** Whether the signature is valid */
  signatureValid: boolean;
}

/**
 * Paginated events response
 */
export interface VerifyEventsResponse {
  /** Array of events */
  events: VerifyEvent[];
  /** Total number of events */
  totalCount: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Items per page */
  limit: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetches platform-wide statistics for verification
 *
 * @returns Promise resolving to platform stats
 * @throws {Error} If the request fails
 *
 * @example
 * ```typescript
 * const stats = await getVerifyStats();
 * console.log(`${stats.handsPlayed} hands played`);
 * ```
 */
export async function getVerifyStats(): Promise<VerifyStats> {
  return apiClient<VerifyStats>('/api/verify/stats');
}

/**
 * Fetches activity time-series data for the last 48 hours
 *
 * @returns Promise resolving to hourly activity data
 * @throws {Error} If the request fails
 *
 * @example
 * ```typescript
 * const activity = await getVerifyActivity();
 * activity.handsPerHour.forEach(h => console.log(`${h.hour}: ${h.count} hands`));
 * ```
 */
export async function getVerifyActivity(): Promise<VerifyActivity> {
  return apiClient<VerifyActivity>('/api/verify/activity');
}

/**
 * Fetches paginated events for public verification
 *
 * @param page - Page number (1-indexed, default: 1)
 * @param limit - Items per page (default: 20, max: 100)
 * @returns Promise resolving to paginated events response
 * @throws {Error} If the request fails
 *
 * @example
 * ```typescript
 * const response = await getVerifyEvents(1, 20);
 * console.log(`Page ${response.page} of ${response.totalPages}`);
 * response.events.forEach(e => console.log(`Event ${e.eventId}: ${e.kind}`));
 * ```
 */
export async function getVerifyEvents(
  page: number = 1,
  limit: number = 20
): Promise<VerifyEventsResponse> {
  return apiClient<VerifyEventsResponse>(`/api/verify/events?page=${page}&limit=${limit}`);
}

