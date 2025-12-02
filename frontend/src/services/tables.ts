/**
 * Table service for frontend
 *
 * Provides functions to interact with backend table endpoints.
 */

import { apiClient } from './apiClient';

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
  return apiClient<CreatedTable>('/createTable', {
    method: 'POST',
    requireAuth: true,
    signature,
    body: JSON.stringify(input),
  });
}

/**
 * Gets all poker tables from the backend
 *
 * @returns Promise that resolves to an array of poker tables
 * @throws {Error} If the request fails
 */
export async function getPokerTables(): Promise<PokerTable[]> {
  return apiClient<PokerTable[]>('/pokerTables');
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
  return apiClient<TablePlayer[]>(`/tablePlayers?tableId=${tableId}`);
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
  return apiClient<JoinTableResponse>('/joinTable', {
    method: 'POST',
    requireAuth: true,
    signature,
    twitterToken: twitterAccessToken,
    walletAddress,
    body: JSON.stringify(input),
  });
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
  return apiClient<TableSeatSession[]>(`/admin/tableSessions?tableId=${tableId}`, {
    requireAuth: true,
    signature,
    adminAddress,
  });
}

/**
 * Input for standing up from a table
 */
export interface StandUpInput {
  tableId: number;
}

/**
 * Response from standing up from a table
 */
export interface StandUpResponse {
  id: number;
  tableId: number;
  walletAddress: string;
  seatNumber: number;
  tableBalanceGwei: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  joinedAt: string;
  leftAt: string;
  isActive: boolean;
}

/**
 * Stands up from a poker table
 *
 * POST /standUp
 *
 * Auth:
 * - Requires wallet signature authentication
 *
 * Request:
 * - Body: { tableId }
 * - Query params: walletAddress
 * - Headers: Authorization (signature)
 *
 * Response:
 * - 200: StandUpResponse
 * - 400: { error: string; message: string } - Invalid request
 * - 401: { error: string; message: string } - Unauthorized
 * - 404: { error: string; message: string } - No active session found
 *
 * @param input - Stand up parameters
 * @param walletAddress - User's wallet address
 * @param signature - Session signature
 * @returns Promise that resolves to the updated session
 * @throws {Error} If the request fails
 */
export async function standUp(
  input: StandUpInput,
  walletAddress: string,
  signature: string
): Promise<StandUpResponse> {
  return apiClient<StandUpResponse>('/standUp', {
    method: 'POST',
    requireAuth: true,
    signature,
    walletAddress,
    body: JSON.stringify(input),
  });
}

/**
 * Card representation
 */
export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
}

/**
 * Hand player in current hand
 */
export interface HandPlayer {
  seatNumber: number;
  walletAddress: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  status: 'ACTIVE' | 'FOLDED' | 'ALL_IN';
  chipsCommitted: string;
  holeCards: Card[] | null; // Only for authorized player if active
}

/**
 * Pot in current hand
 */
export interface HandPot {
  potNumber: number;
  amount: string;
  eligibleSeatNumbers: number[];
}

/**
 * Current hand state
 */
export interface CurrentHand {
  handId: number;
  status: string;
  round: string | null;
  communityCards: Card[];
  players: HandPlayer[];
  pots: HandPot[];
  dealerPosition: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  currentActionSeat: number | null;
  currentBet: string | null;
  lastRaiseAmount: string | null;
}

/**
 * Gets the current active hand for a table
 *
 * GET /currentHand
 *
 * Auth:
 * - Requires wallet signature authentication
 *
 * Request:
 * - Query params: tableId, walletAddress
 * - Headers: Authorization (signature)
 *
 * Response:
 * - 200: CurrentHand
 * - 404: { error: string; message: string } - No active hand found
 * - 401: { error: string; message: string } - Unauthorized
 *
 * @param tableId - The poker table ID
 * @param walletAddress - User's wallet address
 * @param signature - Session signature
 * @returns Promise that resolves to the current hand state
 * @throws {Error} If the request fails
 */
export async function getCurrentHand(
  tableId: number,
  walletAddress: string,
  signature: string
): Promise<CurrentHand> {
  return apiClient<CurrentHand>(`/currentHand?tableId=${tableId}&walletAddress=${encodeURIComponent(walletAddress)}`, {
    requireAuth: true,
    signature,
  });
}

/**
 * Watches the current active hand for a table (public, no authentication required)
 *
 * GET /watchCurrentHand
 *
 * Auth:
 * - No authentication required (public endpoint)
 *
 * Request:
 * - Query params: tableId
 *
 * Response:
 * - 200: CurrentHand (without hole cards for any players)
 * - 404: { error: string; message: string } - No active hand found
 *
 * @param tableId - The poker table ID
 * @returns Promise that resolves to the current hand state (without hole cards)
 * @throws {Error} If the request fails
 */
export async function watchCurrentHand(
  tableId: number
): Promise<CurrentHand> {
  return apiClient<CurrentHand>(`/watchCurrentHand?tableId=${tableId}`);
}

/**
 * Response from player action
 */
export interface PlayerActionResponse {
  success: boolean;
  handEnded: boolean;
  roundAdvanced?: boolean;
  tableId: number;
  winnerSeatNumber: number | null;
}

/**
 * Processes a player action (fold, call, raise) during a poker hand
 *
 * POST /action
 *
 * @param tableId - Table ID
 * @param action - Action type ('FOLD', 'CALL', 'RAISE')
 * @param walletAddress - Wallet address
 * @param signature - Session signature
 * @param amount - Optional bet amount for RAISE (in gwei)
 * @returns Promise that resolves to action result
 * @throws {Error} If the request fails
 */
export async function playerAction(
  tableId: number,
  action: 'FOLD' | 'CALL' | 'CHECK' | 'BET' | 'RAISE' | 'ALL_IN',
  walletAddress: string,
  signature: string,
  amountGwei?: string
): Promise<PlayerActionResponse> {
  const body: any = {
    tableId,
    action,
  };

  if (amountGwei !== undefined) {
    body.amountGwei = amountGwei;
  }

  return apiClient<PlayerActionResponse>('/action', {
    method: 'POST',
    requireAuth: true,
    signature,
    walletAddress,
    body: JSON.stringify(body),
  });
}

