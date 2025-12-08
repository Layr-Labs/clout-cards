/**
 * Hand History Service
 *
 * Provides functions to fetch hand history and hand events for TEE verification.
 * Used by the HandHistory component to display completed hands and verify TEE signatures.
 */

import { apiClient } from './apiClient';
import type { Card } from './tables';

/**
 * Summary of a completed hand for the hand history list
 */
export interface HandSummary {
  /** Unique hand ID */
  id: number;
  /** ISO timestamp when hand started */
  startedAt: string;
  /** ISO timestamp when hand completed */
  completedAt: string | null;
  /** Winners of this hand */
  winners: Array<{
    seatNumber: number;
    walletAddress: string;
    /** Amount won in gwei (as string for BigInt) */
    amount: string;
  }>;
  /** Total pot size in gwei (as string for BigInt) */
  totalPot: string;
  /** Community cards shown during the hand */
  communityCards: Card[];
  /** Number of players in the hand */
  playerCount: number;
}

/**
 * Event data with TEE signature for verification
 */
export interface HandEvent {
  /** Unique event ID */
  eventId: number;
  /** Event kind (hand_start, hand_action, hand_end, community_cards) */
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
  /** TEE public key (address) that signed this event */
  teePubkey: string;
  /** TEE version */
  teeVersion: number;
  /** ISO timestamp when event was created */
  blockTs: string;
}

/**
 * Player information for a hand
 */
export interface HandPlayer {
  seatNumber: number;
  walletAddress: string;
  holeCards: Card[] | null;
  status: string;
}

/**
 * Pot information for a hand
 */
export interface HandPot {
  potNumber: number;
  /** Amount in gwei (as string for BigInt) */
  amount: string;
  winnerSeatNumbers: number[] | null;
}

/**
 * Detailed hand data including deck for verification
 */
export interface HandDetail {
  /** Hand ID */
  id: number;
  /** Table ID */
  tableId: number;
  /** Keccak256 hash of deck commitment: keccak256(deck || nonce), published at hand start */
  shuffleSeedHash: string;
  /** Shuffle seed revealed at hand end (null if hand not complete) */
  shuffleSeed: string | null;
  /** Secret 256-bit nonce for deck commitment verification (null if hand not complete) */
  deckNonce: string | null;
  /** Full deck of 52 cards (null if hand not complete, revealed at hand end) */
  deck: Card[] | null;
  /** ISO timestamp when hand started */
  startedAt: string;
  /** ISO timestamp when hand completed */
  completedAt: string | null;
  /** Community cards */
  communityCards: Card[];
  /** Dealer seat position */
  dealerPosition: number | null;
  /** Players in the hand */
  players: HandPlayer[];
  /** Pots in the hand */
  pots: HandPot[];
}

/**
 * EIP-712 domain for signature verification
 */
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * Response from the hand events endpoint
 */
export interface HandEventsResponse {
  /** Detailed hand data */
  hand: HandDetail;
  /** All events for this hand with signature data */
  events: HandEvent[];
  /** EIP-712 domain for verification */
  eip712Domain: EIP712Domain;
  /** Wallet address to Twitter handle mapping for display */
  walletToTwitter: Record<string, string>;
}

/**
 * Fetches the hand history for a table
 *
 * Returns a list of completed hands with summary information including
 * winners, pot sizes, and community cards.
 *
 * @param tableId - The table ID to get history for
 * @param limit - Maximum number of hands to return (default 20, max 50)
 * @returns Promise resolving to array of hand summaries
 * @throws {Error} If the API request fails
 *
 * @example
 * ```typescript
 * const history = await getHandHistory(1);
 * console.log(`${history.length} completed hands`);
 * ```
 */
export async function getHandHistory(
  tableId: number,
  limit: number = 20
): Promise<HandSummary[]> {
  return apiClient<HandSummary[]>(
    `/api/tables/${tableId}/handHistory?limit=${limit}`
  );
}

/**
 * Fetches all events for a specific hand with TEE signature data
 *
 * Returns the hand details including the deck commitment (shuffleSeedHash),
 * revealed deck, nonce, and all events with their signatures for verification.
 *
 * Note: deck, shuffleSeed, and deckNonce are only returned for completed hands.
 * For active hands, these fields will be null.
 *
 * @param handId - The hand ID to get events for
 * @returns Promise resolving to hand detail with events and EIP-712 domain
 * @throws {Error} If the API request fails
 *
 * @example
 * ```typescript
 * const { hand, events, eip712Domain } = await getHandEvents(123);
 * // Verify each event signature
 * for (const event of events) {
 *   const isValid = verifyEventSignature(event, eip712Domain);
 *   console.log(`Event ${event.eventId}: ${isValid ? 'valid' : 'INVALID'}`);
 * }
 * // Verify deck commitment (only for completed hands)
 * if (hand.deck && hand.deckNonce) {
 *   const deckValid = verifyDeckCommitment(hand.shuffleSeedHash, hand.deck, hand.deckNonce);
 * }
 * ```
 */
export async function getHandEvents(handId: number): Promise<HandEventsResponse> {
  return apiClient<HandEventsResponse>(`/api/hands/${handId}/events`);
}

/**
 * Fetches the TEE public key from the backend
 *
 * @returns Promise resolving to the TEE public key (Ethereum address)
 * @throws {Error} If the API request fails
 */
export async function getTeePublicKey(): Promise<string> {
  const response = await apiClient<{ publicKey: string }>('/tee/publicKey');
  return response.publicKey;
}

