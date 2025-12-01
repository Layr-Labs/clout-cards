/**
 * Test fixtures and helper functions
 *
 * Provides helper functions to create test data for integration tests.
 * These functions simplify test setup by creating common database records.
 */

import { PrismaClient } from '@prisma/client';
import { Card } from '../../src/types/cards';

/**
 * Creates a test poker table with default or custom values
 *
 * @param prisma - Prisma client
 * @param options - Table configuration options
 * @returns Created table record
 */
export async function createTestTable(
  prisma: PrismaClient,
  options: {
    name?: string;
    minimumBuyIn?: bigint;
    maximumBuyIn?: bigint;
    perHandRake?: number;
    maxSeatCount?: number;
    smallBlind?: bigint;
    bigBlind?: bigint;
    isActive?: boolean;
  } = {}
): Promise<any> {
  const {
    name = 'Test Table',
    minimumBuyIn = 1000000000n, // 1 ETH
    maximumBuyIn = 10000000000n, // 10 ETH
    perHandRake = 0, // No rake by default
    maxSeatCount = 8,
    smallBlind = 1000000n, // 0.001 ETH
    bigBlind = 2000000n, // 0.002 ETH
    isActive = true,
  } = options;

  return await prisma.pokerTable.create({
    data: {
      name,
      minimumBuyIn,
      maximumBuyIn,
      perHandRake,
      maxSeatCount,
      smallBlind,
      bigBlind,
      isActive,
    },
  });
}

/**
 * Creates test players (table seat sessions) for a table
 *
 * @param prisma - Prisma client
 * @param tableId - Table ID
 * @param players - Array of player configurations
 * @returns Array of created seat session records
 */
export async function createTestPlayers(
  prisma: PrismaClient,
  tableId: number,
  players: Array<{
    seatNumber: number;
    walletAddress: string;
    tableBalanceGwei: bigint;
    twitterHandle?: string;
    twitterAvatarUrl?: string;
  }>
): Promise<any[]> {
  const created: any[] = [];
  for (const player of players) {
    const session = await prisma.tableSeatSession.create({
      data: {
        tableId,
        seatNumber: player.seatNumber,
        walletAddress: player.walletAddress.toLowerCase(),
        tableBalanceGwei: player.tableBalanceGwei,
        twitterHandle: player.twitterHandle || null,
        twitterAvatarUrl: player.twitterAvatarUrl || null,
        isActive: true,
      },
    });
    created.push(session);
  }
  return created;
}

/**
 * Creates a test hand with custom configuration
 *
 * @param prisma - Prisma client
 * @param tableId - Table ID
 * @param options - Hand configuration options
 * @returns Created hand record
 */
export async function createTestHand(
  prisma: PrismaClient,
  tableId: number,
  options: {
    deck: Card[];
    dealerPosition: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    currentActionSeat: number;
    round: 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
    status: 'WAITING_FOR_PLAYERS' | 'SHUFFLING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETED';
    deckPosition?: number;
    currentBet?: bigint;
    lastRaiseAmount?: bigint;
    communityCards?: Card[];
    shuffleSeedHash?: string;
  }
): Promise<any> {
  const {
    deck,
    dealerPosition,
    smallBlindSeat,
    bigBlindSeat,
    currentActionSeat,
    round,
    status,
    deckPosition = 0,
    currentBet = 0n,
    lastRaiseAmount = null,
    communityCards = [],
    shuffleSeedHash = '0x' + '0'.repeat(64), // Default hash
  } = options;

  // If deckPosition is set and communityCards is empty, extract community cards from deck
  // This helps tests that set deckPosition but don't explicitly set communityCards
  let finalCommunityCards = communityCards;
  if (finalCommunityCards.length === 0 && deckPosition >= 9) {
    // deckPosition 9 means we've dealt: 2 hole cards per player (4 cards) + flop (3) + turn (1) + river (1) = 9
    // Community cards are at positions 4-8 in the deck (after 2 players' hole cards)
    finalCommunityCards = deck.slice(4, 9);
  }

  return await (prisma as any).hand.create({
    data: {
      tableId,
      dealerPosition,
      smallBlindSeat,
      bigBlindSeat,
      currentActionSeat,
      round,
      status,
      deck: deck as any,
      deckPosition,
      currentBet,
      lastRaiseAmount,
      communityCards: finalCommunityCards as any,
      shuffleSeedHash,
    },
  });
}

/**
 * Creates hand players (participants in a hand)
 *
 * @param prisma - Prisma client
 * @param handId - Hand ID
 * @param players - Array of hand player configurations
 * @returns Array of created hand player records
 */
export async function createHandPlayers(
  prisma: PrismaClient,
  handId: number,
  players: Array<{
    seatNumber: number;
    walletAddress: string;
    status?: 'ACTIVE' | 'FOLDED' | 'ALL_IN';
    chipsCommitted?: bigint;
    holeCards: Card[];
  }>
): Promise<any[]> {
  const created: any[] = [];
  for (const player of players) {
    const handPlayer = await (prisma as any).handPlayer.create({
      data: {
        handId,
        seatNumber: player.seatNumber,
        walletAddress: player.walletAddress.toLowerCase(),
        status: player.status || 'ACTIVE',
        chipsCommitted: player.chipsCommitted || 0n,
        holeCards: player.holeCards as any,
      },
    });
    created.push(handPlayer);
  }
  return created;
}

/**
 * Creates a fabricated deck from a list of cards
 *
 * This function creates a deterministic deck for testing purposes.
 * The cards are provided in the order they should appear in the deck.
 *
 * @param cards - Array of card objects with rank and suit
 * @returns Array of Card objects representing the deck
 */
export function createFabricatedDeck(
  cards: Array<{ rank: string; suit: string }>
): Card[] {
  // Ensure we have exactly 52 cards
  if (cards.length < 52) {
    // Fill remaining slots with placeholder cards
    const remaining = 52 - cards.length;
    const placeholders = Array(remaining).fill({ rank: '2', suit: 'hearts' });
    cards = [...cards, ...placeholders];
  }

  return cards.slice(0, 52).map((card) => ({
    rank: card.rank,
    suit: card.suit,
  })) as Card[];
}

/**
 * Cleans up all test data from the database
 *
 * This function deletes all records from test tables in the correct order
 * to respect foreign key constraints.
 *
 * @param prisma - Prisma client
 */
export async function cleanupTestData(prisma: PrismaClient): Promise<void> {
  // Delete in order of dependencies (child tables first)
  await (prisma as any).handAction.deleteMany({});
  await (prisma as any).pot.deleteMany({});
  await (prisma as any).handPlayer.deleteMany({});
  await (prisma as any).hand.deleteMany({});
  await prisma.tableSeatSession.deleteMany({});
  await prisma.pokerTable.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.playerEscrowBalance.deleteMany({});
}

