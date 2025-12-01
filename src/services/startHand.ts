/**
 * Start hand service
 *
 * Handles starting a new poker hand at a table with atomic transactions.
 * Creates hand, shuffles deck, assigns dealer/blinds, posts blinds, deals cards.
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../db/client';
import { createEventInTransaction, EventKind } from '../db/events';
import { keccak256, toUtf8Bytes } from 'ethers';
import { Card, SUITS, RANKS } from '../types/cards';
import { validateTableExistsAndActive, findActiveHand } from '../utils/tableValidation';

// HandStatus type from Prisma schema
type HandStatus = 'WAITING_FOR_PLAYERS' | 'SHUFFLING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETED';

/**
 * Creates a standard 52-card deck
 */
function createStandardDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

/**
 * Shuffles a deck using a seed (for deterministic shuffling)
 * Uses Fisher-Yates shuffle with seeded random number generator
 */
function shuffleDeck(deck: Card[], seed: number): Card[] {
  const shuffled = [...deck];
  let random = seed;

  // Simple LCG (Linear Congruential Generator) for seeded randomness
  function seededRandom() {
    random = (random * 1103515245 + 12345) & 0x7fffffff;
    return random / 0x7fffffff;
  }

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Starts a new poker hand at a table
 *
 * Atomically:
 * 1. Validates at least 2 players with sufficient balance
 * 2. Creates standard deck and shuffles it
 * 3. Creates deck commitment hash
 * 4. Assigns dealer and blind positions
 * 5. Creates hand record
 * 6. Creates hand player records
 * 7. Posts blinds (deducts from table balance, creates actions)
 * 8. Deals hole cards
 * 9. Creates start_hand event
 *
 * @param tableId - Table ID to start hand at
 * @param prismaClient - Optional Prisma client instance (defaults to global prisma)
 * @returns The created hand record
 * @throws {Error} If validation fails or transaction fails
 */
export async function startHand(tableId: number, prismaClient?: PrismaClient): Promise<{
  id: number;
  tableId: number;
  status: HandStatus;
  dealerPosition: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  currentActionSeat: number;
}> {
  const client = prismaClient || prisma;
  return await client.$transaction(async (tx) => {
    // 1. Validate table exists and is active
    const table = await validateTableExistsAndActive(tableId, tx);

    // Check for existing active hand
    const existingHand = await findActiveHand(tableId, tx, false);

    if (existingHand) {
      throw new Error(`Hand ${existingHand.id} is already in progress`);
    }

    // Get all active players at this table
    const activeSessions = await tx.tableSeatSession.findMany({
      where: {
        tableId,
        isActive: true,
      },
      orderBy: {
        seatNumber: 'asc',
      },
    });

    // Filter players who can afford big blind
    const eligiblePlayers = activeSessions.filter(
      (session) => session.tableBalanceGwei >= table.bigBlind
    );

    if (eligiblePlayers.length < 2) {
      throw new Error(`Need at least 2 players with sufficient balance. Found ${eligiblePlayers.length} eligible players`);
    }

    // 2. Create and shuffle deck
    const standardDeck = createStandardDeck();
    const timestamp = Date.now();
    const shuffledDeck = shuffleDeck(standardDeck, timestamp);

    // 3. Create deck commitment hash (hash of JSON stringified shuffled deck)
    // The commitment is the hash of the full shuffled deck JSON
    const deckJson = JSON.stringify(shuffledDeck);
    const deckCommitmentHash = keccak256(toUtf8Bytes(deckJson));

    // 4. Assign dealer and blinds with rotation
    // Find the most recent completed hand to get the previous dealer position
    const previousHand = await (tx as any).hand.findFirst({
      where: {
        tableId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    let dealerIndex = 0; // Default to first eligible player for first hand

    if (previousHand && previousHand.dealerPosition !== null) {
      // Find the previous dealer in the current eligible players list
      const previousDealerSeat = previousHand.dealerPosition;
      const previousDealerIndex = eligiblePlayers.findIndex(
        (p) => p.seatNumber === previousDealerSeat
      );

      if (previousDealerIndex !== -1) {
        // Rotate to next dealer (wrapping around)
        dealerIndex = (previousDealerIndex + 1) % eligiblePlayers.length;
      }
      // If previous dealer is not in eligible players (they left or can't afford), start from 0
    }

    const dealerPosition = eligiblePlayers[dealerIndex].seatNumber;
    
    // In 2-player (heads-up) poker, the dealer posts the small blind
    // In 3+ player games, small blind is after dealer, big blind is after small blind
    let smallBlindIndex: number;
    let bigBlindIndex: number;
    
    if (eligiblePlayers.length === 2) {
      // Heads-up: dealer is small blind, other player is big blind
      smallBlindIndex = dealerIndex;
      bigBlindIndex = (dealerIndex + 1) % eligiblePlayers.length;
    } else {
      // 3+ players: small blind after dealer, big blind after small blind
      smallBlindIndex = (dealerIndex + 1) % eligiblePlayers.length;
      bigBlindIndex = (dealerIndex + 2) % eligiblePlayers.length;
    }
    
    const smallBlindSeat = eligiblePlayers[smallBlindIndex].seatNumber;
    const bigBlindSeat = eligiblePlayers[bigBlindIndex].seatNumber;

    // Current action starts with player after big blind (or small blind if only 2 players)
    const firstActionIndex = eligiblePlayers.length === 2 ? smallBlindIndex : (bigBlindIndex + 1) % eligiblePlayers.length;
    const currentActionSeat = eligiblePlayers[firstActionIndex].seatNumber;

    // 5. Create hand record
    const hand = await (tx as any).hand.create({
      data: {
        tableId,
        status: 'SHUFFLING',
        round: null,
        dealerPosition,
        smallBlindSeat,
        bigBlindSeat,
        currentActionSeat,
        currentBet: table.bigBlind,
        lastRaiseAmount: table.bigBlind - table.smallBlind, // Big blind is the first "raise"
        deck: shuffledDeck as any, // Prisma JSON type
        deckPosition: 0,
        communityCards: [] as any,
        shuffleSeedHash: deckCommitmentHash,
        shuffleSeed: null, // Will be revealed after hand completes
      },
    });

    // 6. Create hand player records and deal hole cards
    let deckPosition = 0;
    const handPlayers = [];

    for (const session of eligiblePlayers) {
      // Deal 2 hole cards
      const holeCards = [
        shuffledDeck[deckPosition],
        shuffledDeck[deckPosition + 1],
      ];
      deckPosition += 2;

      const handPlayer = await (tx as any).handPlayer.create({
      data: {
        handId: hand.id,
        seatNumber: session.seatNumber,
        walletAddress: session.walletAddress,
        status: 'ACTIVE',
        chipsCommitted: 0n,
        holeCards: holeCards as any,
      },
      });

      handPlayers.push(handPlayer);
    }

    // 7. Post blinds and create actions
    // Small blind
    const smallBlindPlayer = eligiblePlayers[smallBlindIndex];
    await tx.tableSeatSession.update({
      where: { id: smallBlindPlayer.id },
      data: {
        tableBalanceGwei: smallBlindPlayer.tableBalanceGwei - table.smallBlind,
      },
    });

    await (tx as any).handPlayer.update({
      where: { id: handPlayers[smallBlindIndex].id },
      data: {
        chipsCommitted: table.smallBlind,
      },
    });

    await (tx as any).handAction.create({
      data: {
        handId: hand.id,
        seatNumber: smallBlindSeat,
        round: 'PRE_FLOP',
        action: 'POST_BLIND',
        amount: table.smallBlind,
      },
    });

    // Big blind
    const bigBlindPlayer = eligiblePlayers[bigBlindIndex];
    await tx.tableSeatSession.update({
      where: { id: bigBlindPlayer.id },
      data: {
        tableBalanceGwei: bigBlindPlayer.tableBalanceGwei - table.bigBlind,
      },
    });

    await (tx as any).handPlayer.update({
      where: { id: handPlayers[bigBlindIndex].id },
      data: {
        chipsCommitted: table.bigBlind,
      },
    });

    await (tx as any).handAction.create({
      data: {
        handId: hand.id,
        seatNumber: bigBlindSeat,
        round: 'PRE_FLOP',
        action: 'POST_BLIND',
        amount: table.bigBlind,
      },
    });

    // 8. Create main pot
    const potAmount = table.smallBlind + table.bigBlind;
    await (tx as any).pot.create({
      data: {
        handId: hand.id,
        potNumber: 0,
        amount: potAmount,
        eligibleSeatNumbers: eligiblePlayers.map((p) => p.seatNumber) as any,
        winnerSeatNumbers: null,
      },
    });

    // 9. Update hand status to PRE_FLOP
    const updatedHand = await (tx as any).hand.update({
      where: { id: hand.id },
      data: {
        status: 'PRE_FLOP',
        round: 'PRE_FLOP',
        deckPosition, // Update deck position after dealing
      },
    });

    // 10. Create start_hand event with full payload
    const eventPayload = {
      kind: 'hand_start',
      table: {
        id: table.id,
        name: table.name,
      },
      hand: {
        id: hand.id,
        dealerPosition,
        smallBlindSeat,
        bigBlindSeat,
        shuffleSeedHash: deckCommitmentHash,
      },
      players: eligiblePlayers.map((p) => ({
        seatNumber: p.seatNumber,
        walletAddress: p.walletAddress,
      })),
    };
    const payloadJson = JSON.stringify(eventPayload);

    await createEventInTransaction(tx, EventKind.HAND_START, payloadJson, null, null);

    return {
      id: updatedHand.id,
      tableId: updatedHand.tableId,
      status: updatedHand.status,
      dealerPosition: updatedHand.dealerPosition!,
      smallBlindSeat: updatedHand.smallBlindSeat!,
      bigBlindSeat: updatedHand.bigBlindSeat!,
      currentActionSeat: updatedHand.currentActionSeat!,
    };
  });
}

