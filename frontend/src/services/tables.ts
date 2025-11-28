/**
 * Table service for frontend
 *
 * Provides functions to interact with backend table endpoints.
 */

import { getBackendUrl } from '../config/env';

/**
 * Input for creating a new poker table
 */
export interface CreateTableInput {
  name: string;
  minimumBuyIn: string; // BigInt as string
  maximumBuyIn: string; // BigInt as string
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string; // BigInt as string
  bigBlind: string; // BigInt as string
  isActive?: boolean;
  adminAddress: string;
}

/**
 * Created table response
 */
export interface CreatedTable {
  id: number;
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Poker table from API
 */
export interface PokerTable {
  id: number;
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a new poker table
 *
 * @param input - Table creation parameters
 * @param signature - Session signature from localStorage
 * @returns Promise that resolves to the created table
 * @throws {Error} If the request fails or validation fails
 */
export async function createTable(
  input: CreateTableInput,
  signature: string
): Promise<CreatedTable> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/createTable`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signature}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to create table: ${response.status} ${response.statusText}`
    );
  }

  const table: CreatedTable = await response.json();
  return table;
}

/**
 * Gets all poker tables from the backend
 *
 * @returns Promise that resolves to an array of poker tables
 * @throws {Error} If the request fails
 */
export async function getPokerTables(): Promise<PokerTable[]> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/pokerTables`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch poker tables: ${response.status} ${response.statusText}`
    );
  }

  const tables: PokerTable[] = await response.json();
  return tables;
}

/**
 * Table player from API
 */
export interface TablePlayer {
  id: number;
  walletAddress: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  seatNumber: number;
  joinedAt: string;
  tableBalanceGwei: string;
}

/**
 * Gets all active players for a given table
 *
 * @param tableId - The poker table ID
 * @returns Promise that resolves to an array of table players
 * @throws {Error} If the request fails
 */
export async function getTablePlayers(tableId: number): Promise<TablePlayer[]> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/tablePlayers?tableId=${tableId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch table players: ${response.status} ${response.statusText}`
    );
  }

  const players: TablePlayer[] = await response.json();
  return players;
}

/**
 * Input for joining a table
 */
export interface JoinTableInput {
  tableId: number;
  seatNumber: number;
  buyInAmountGwei: string; // BigInt as string
}

/**
 * Response from joining a table
 */
export interface JoinTableResponse {
  id: number;
  tableId: number;
  walletAddress: string;
  seatNumber: number;
  tableBalanceGwei: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  joinedAt: string;
}

/**
 * Joins a poker table at a specific seat
 *
 * POST /joinTable
 *
 * Auth:
 * - Requires wallet signature authentication
 * - Requires Twitter access token
 * - User must be fully logged in (both wallet and Twitter)
 *
 * Request:
 * - Body: { tableId, seatNumber, buyInAmountGwei }
 * - Query params: walletAddress
 * - Headers: Authorization (signature), X-Twitter-Access-Token
 *
 * Response:
 * - 200: JoinTableResponse
 * - 400: { error: string; message: string } - Invalid request
 * - 401: { error: string; message: string } - Unauthorized
 * - 409: { error: string; message: string } - Conflict (seat occupied, pending withdrawal, etc.)
 *
 * @param input - Join table parameters
 * @param walletAddress - User's wallet address
 * @param signature - Session signature
 * @param twitterAccessToken - Twitter access token
 * @returns Promise that resolves to the created session
 * @throws {Error} If the request fails
 */
export async function joinTable(
  input: JoinTableInput,
  walletAddress: string,
  signature: string,
  twitterAccessToken: string
): Promise<JoinTableResponse> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/joinTable?walletAddress=${encodeURIComponent(walletAddress)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signature}`,
      'X-Twitter-Access-Token': twitterAccessToken,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to join table: ${response.status} ${response.statusText}`
    );
  }

  const session: JoinTableResponse = await response.json();
  return session;
}

/**
 * Table seat session (includes inactive sessions)
 */
export interface TableSeatSession {
  id: number;
  walletAddress: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  seatNumber: number;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
  tableBalanceGwei: string;
}

/**
 * Gets all seat sessions (active and inactive) for a given table
 *
 * GET /admin/tableSessions
 *
 * Auth:
 * - Requires admin signature authentication
 *
 * Request:
 * - Query params: tableId
 * - Headers: Authorization (signature)
 *
 * Response:
 * - 200: Array of TableSeatSession objects
 *
 * @param tableId - The poker table ID
 * @param signature - Admin session signature
 * @returns Promise that resolves to an array of seat sessions
 * @throws {Error} If the request fails
 */
export async function getTableSessions(tableId: number, signature: string, adminAddress: string): Promise<TableSeatSession[]> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/admin/tableSessions?tableId=${tableId}&adminAddress=${encodeURIComponent(adminAddress)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signature}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Failed to fetch table sessions: ${response.status} ${response.statusText}`
    );
  }

  const sessions: TableSeatSession[] = await response.json();
  return sessions;
}

