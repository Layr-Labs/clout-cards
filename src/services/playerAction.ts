/**
 * Player action service
 *
 * Handles player actions during a poker hand (fold, call, raise, etc.)
 * Manages turn progression, hand resolution, and settlement.
 */

import { prisma } from '../db/client';
import { withEvent, EventKind, createEventInTransaction } from '../db/events';
import { startHand } from './startHand';

// Types from Prisma schema
type HandStatus = 'WAITING_FOR_PLAYERS' | 'SHUFFLING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETED';
type HandPlayerStatus = 'ACTIVE' | 'FOLDED' | 'ALL_IN';
type BettingRound = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
type PlayerActionType = 'POST_BLIND' | 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN';

/**
 * Gets the next active player seat number (skips folded players)
 *
 * @param handId - Hand ID
 * @param currentSeat - Current seat number
 * @param tx - Prisma transaction client
 * @returns Next active player's seat number, or null if none found
 */
async function getNextActivePlayer(
  handId: number,
  currentSeat: number,
  tx: any
): Promise<number | null> {
  // Get all hand players ordered by seat number
  const handPlayers = await tx.handPlayer.findMany({
    where: { handId },
    orderBy: { seatNumber: 'asc' },
  });

  if (handPlayers.length === 0) {
    return null;
  }

  // Find current player index
  const currentIndex = handPlayers.findIndex((p: any) => p.seatNumber === currentSeat);
  if (currentIndex === -1) {
    return null;
  }

  // Search forward from current position (wrapping around)
  for (let i = 1; i < handPlayers.length; i++) {
    const nextIndex = (currentIndex + i) % handPlayers.length;
    const nextPlayer = handPlayers[nextIndex];
    
    // Skip folded players, only return ACTIVE players
    if (nextPlayer.status === 'ACTIVE') {
      return nextPlayer.seatNumber;
    }
  }

  return null;
}

/**
 * Counts active players in a hand (not folded)
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 * @returns Number of active players
 */
async function countActivePlayers(handId: number, tx: any): Promise<number> {
  const count = await tx.handPlayer.count({
    where: {
      handId,
      status: 'ACTIVE',
    },
  });
  return count;
}

/**
 * Settles a hand when only one player remains (all others folded)
 *
 * @param handId - Hand ID
 * @param winnerSeatNumber - Seat number of the winning player
 * @param tx - Prisma transaction client
 */
async function settleHand(handId: number, winnerSeatNumber: number, tx: any): Promise<{
  tableId: number;
  totalPotAmount: bigint;
  shuffleSeed: string;
  deck: any;
}> {
  // Get hand with pots
  const hand = await (tx as any).hand.findUnique({
    where: { id: handId },
    include: {
      pots: true,
      players: true,
      table: true,
    },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found`);
  }

  // Get winner's hand player record
  const winnerHandPlayer = hand.players.find((p: any) => p.seatNumber === winnerSeatNumber);
  if (!winnerHandPlayer) {
    throw new Error(`Winner player not found for seat ${winnerSeatNumber}`);
  }

  // Get winner's table seat session
  const winnerSession = await tx.tableSeatSession.findFirst({
    where: {
      tableId: hand.tableId,
      seatNumber: winnerSeatNumber,
      isActive: true,
    },
  });

  if (!winnerSession) {
    throw new Error(`Winner session not found for seat ${winnerSeatNumber}`);
  }

  // Calculate total pot amount and update pots
  let totalPotAmount = 0n;
  const potDetails = [];
  for (const pot of hand.pots) {
    totalPotAmount += pot.amount;
    potDetails.push({
      potNumber: pot.potNumber,
      amount: pot.amount.toString(),
    });
    
    // Update pot with winner
    await (tx as any).pot.update({
      where: { id: pot.id },
      data: {
        winnerSeatNumbers: [winnerSeatNumber] as any,
      },
    });
  }

  // Transfer pot to winner's table balance
  await tx.tableSeatSession.update({
    where: { id: winnerSession.id },
    data: {
      tableBalanceGwei: winnerSession.tableBalanceGwei + totalPotAmount,
    },
  });

  // Get the shuffle seed from the hand's startedAt timestamp
  // The seed was Date.now() when the hand started, so we use startedAt
  const shuffleSeed = hand.startedAt.getTime().toString();

  // Update hand status and reveal shuffle seed
  await (tx as any).hand.update({
    where: { id: handId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      shuffleSeed: shuffleSeed,
    },
  });

  return {
    tableId: hand.tableId,
    totalPotAmount,
    shuffleSeed,
    deck: hand.deck,
  };
}

/**
 * Creates HAND_END event after hand settlement
 *
 * @param handId - Hand ID
 * @param winnerSeatNumber - Winner's seat number
 * @param totalPotAmount - Total pot amount awarded
 * @param shuffleSeed - Revealed shuffle seed
 * @param deck - Full deck for verification
 */
async function createHandEndEvent(
  handId: number,
  winnerSeatNumber: number,
  totalPotAmount: bigint,
  shuffleSeed: string,
  deck: any,
  tableId: number
): Promise<void> {
  // Get hand details for event
  const hand = await (prisma as any).hand.findUnique({
    where: { id: handId },
    include: {
      table: true,
      pots: true,
      players: true,
      actions: true,
    },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found for event creation`);
  }

  const payload = {
    kind: 'hand_end',
    table: {
      id: hand.table.id,
      name: hand.table.name,
    },
    hand: {
      id: hand.id,
      winnerSeatNumber,
      totalPotAmount: totalPotAmount.toString(),
      shuffleSeed, // Revealed seed for verification
      deck, // Full deck for verification
      completedAt: hand.completedAt?.toISOString(),
    },
    pots: hand.pots.map((pot: any) => ({
      potNumber: pot.potNumber,
      amount: pot.amount.toString(),
      winnerSeatNumbers: Array.isArray(pot.winnerSeatNumbers) ? pot.winnerSeatNumbers : [],
    })),
    actions: hand.actions.map((action: any) => ({
      seatNumber: action.seatNumber,
      round: action.round,
      action: action.action,
      amount: action.amount?.toString() || null,
      timestamp: action.timestamp.toISOString(),
    })),
  };

  const payloadJson = JSON.stringify(payload);

  await prisma.$transaction(async (tx) => {
    await createEventInTransaction(tx, EventKind.HAND_END, payloadJson, null, null);
  });
}

/**
 * Processes a fold action
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Marks player as folded
 * 3. Creates fold action record
 * 4. Advances to next active player
 * 5. If only one player remains, settles hand
 *
 * After transaction:
 * - Creates HAND_END event if hand ended
 * - Starts new hand if conditions met
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address
 * @returns Success indicator
 * @throws {Error} If validation fails or transaction fails
 */
export async function foldAction(
  tableId: number,
  walletAddress: string
): Promise<{ success: boolean; handEnded: boolean; tableId: number; winnerSeatNumber: number | null }> {
  const normalizedAddress = walletAddress.toLowerCase();

  type SettlementData = {
    handId: number;
    winnerSeatNumber: number;
    totalPotAmount: bigint;
    shuffleSeed: string;
    deck: any;
  };

  let settlementData: SettlementData | null = null;

  // Use transaction directly so we can build complete event payload with hand data
  const result = await prisma.$transaction(async (tx): Promise<{ success: boolean; handEnded: boolean; tableId: number; winnerSeatNumber: number | null }> => {
      // 1. Get table and validate
      const table = await tx.pokerTable.findUnique({
        where: { id: tableId },
      });

      if (!table) {
        throw new Error(`Table with id ${tableId} not found`);
      }

      if (!table.isActive) {
        throw new Error(`Table ${table.name} is not active`);
      }

      // 2. Get active hand
      const hand = await (tx as any).hand.findFirst({
        where: {
          tableId,
          status: {
            not: 'COMPLETED',
          },
        },
        include: {
          players: true,
        },
      });

      if (!hand) {
        throw new Error(`No active hand found for table ${tableId}`);
      }

      // 3. Get player's seat session
      const seatSession = await tx.tableSeatSession.findFirst({
        where: {
          tableId,
          walletAddress: normalizedAddress,
          isActive: true,
        },
      });

      if (!seatSession) {
        throw new Error(`Player not seated at table ${tableId}`);
      }

      // 4. Get hand player record
      const handPlayer = hand.players.find(
        (p: any) => p.seatNumber === seatSession.seatNumber
      );

      if (!handPlayer) {
        throw new Error(`Player not in hand`);
      }

      if (handPlayer.status !== 'ACTIVE') {
        throw new Error(`Player already ${handPlayer.status.toLowerCase()}`);
      }

      // 5. Validate it's the player's turn
      if (hand.currentActionSeat !== seatSession.seatNumber) {
        throw new Error(`Not player's turn. Current action seat: ${hand.currentActionSeat}`);
      }

      // 6. Mark player as folded
      await (tx as any).handPlayer.update({
        where: { id: handPlayer.id },
        data: {
          status: 'FOLDED',
        },
      });

      // 7. Create fold action record
      const handAction = await (tx as any).handAction.create({
        data: {
          handId: hand.id,
          seatNumber: seatSession.seatNumber,
          round: hand.round!,
          action: 'FOLD',
          amount: null, // Fold has no amount
        },
      });

      // 8. Create hand action event with full metadata
      const actionPayload = {
        kind: 'hand_action',
        table: {
          id: table.id,
          name: table.name,
        },
        hand: {
          id: hand.id,
          round: hand.round,
          status: hand.status,
        },
        action: {
          type: 'FOLD',
          seatNumber: seatSession.seatNumber,
          walletAddress: normalizedAddress,
          amount: null,
          timestamp: handAction.timestamp.toISOString(),
        },
      };
      const actionPayloadJson = JSON.stringify(actionPayload);
      await createEventInTransaction(tx, EventKind.BET, actionPayloadJson, normalizedAddress, null);

      // 9. Count remaining active players (after fold)
      const activeCount = await countActivePlayers(hand.id, tx);

      let handEnded = false;
      let winnerSeatNumber: number | null = null;

      if (activeCount === 1) {
        // Hand ends - only one player remains
        handEnded = true;
        
        // Get the remaining active player (winner) - reload to get updated statuses
        const updatedPlayers = await (tx as any).handPlayer.findMany({
          where: { handId: hand.id },
        });
        const remainingPlayer = updatedPlayers.find((p: any) => p.status === 'ACTIVE');
        if (!remainingPlayer) {
          throw new Error('No remaining active player found');
        }

        winnerSeatNumber = remainingPlayer.seatNumber;

        // Settle the hand (payout, reveal deck, mark completed)
        // Store settlement data for HAND_END event creation after transaction
        const settlement = await settleHand(hand.id, remainingPlayer.seatNumber, tx);
        settlementData = {
          handId: hand.id,
          winnerSeatNumber: remainingPlayer.seatNumber,
          totalPotAmount: settlement.totalPotAmount,
          shuffleSeed: settlement.shuffleSeed,
          deck: settlement.deck,
        };
      } else {
        // Advance to next active player
        const nextSeat = await getNextActivePlayer(hand.id, seatSession.seatNumber, tx);
        
        if (nextSeat === null) {
          throw new Error('No next active player found');
        }

        await (tx as any).hand.update({
          where: { id: hand.id },
          data: {
            currentActionSeat: nextSeat,
          },
        });
      }

      return { success: true, handEnded, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  if (result.handEnded && settlementData) {
    // Create HAND_END event in separate transaction
    // TypeScript assertion: settlementData is guaranteed to be non-null when handEnded is true
    await createHandEndEvent(
      (settlementData as SettlementData).handId,
      (settlementData as SettlementData).winnerSeatNumber,
      (settlementData as SettlementData).totalPotAmount,
      (settlementData as SettlementData).shuffleSeed,
      (settlementData as SettlementData).deck,
      tableId
    );

    // Start new hand if conditions are met (separate transaction)
    await startNewHandIfPossible(tableId);
  }

  return result;
}

/**
 * Starts a new hand after settlement if conditions are met
 *
 * This should be called after a hand ends to start the next hand.
 * Uses the same logic as joinTable -> startHand.
 *
 * @param tableId - Table ID
 */
export async function startNewHandIfPossible(tableId: number): Promise<void> {
  // Check if there's already an active hand
  const existingHand = await (prisma as any).hand.findFirst({
    where: {
      tableId,
      status: {
        not: 'COMPLETED',
      },
    },
  });

  if (existingHand) {
    return; // Hand already in progress
  }

  // Get table
  const table = await prisma.pokerTable.findUnique({
    where: { id: tableId },
  });

  if (!table || !table.isActive) {
    return; // Table doesn't exist or is inactive
  }

  // Get active players
  const activeSessions = await prisma.tableSeatSession.findMany({
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

  // Need at least 2 eligible players
  if (eligiblePlayers.length >= 2) {
    await startHand(tableId);
  }
}

