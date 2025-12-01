/**
 * Player action service
 *
 * Handles player actions during a poker hand (fold, call, raise, etc.)
 * Manages turn progression, hand resolution, and settlement.
 */

import { prisma } from '../db/client';
import { withEvent, EventKind, createEventInTransaction } from '../db/events';
import { startHand } from './startHand';
import { evaluateHand, compareHands, HandRank, getHandRankName, type EvaluatedHand } from './pokerHandEvaluation';
import { Card } from '../types/cards';

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
 * Checks if the current betting round is complete
 *
 * A betting round is complete when:
 * 1. All active players have acted in the current round (taken an action)
 * 2. AND all active players have matched the current bet (chipsCommitted === currentBet)
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 * @returns True if betting round is complete
 */
async function isBettingRoundComplete(handId: number, tx: any): Promise<boolean> {
  const hand = await (tx as any).hand.findUnique({
    where: { id: handId },
  });

  if (!hand || hand.currentBet === null || hand.currentBet === undefined || !hand.round) {
    return false;
  }

  const currentBet = hand.currentBet;
  const currentRound = hand.round;
  
  // Get all active players
  const handPlayers = await (tx as any).handPlayer.findMany({
    where: { handId },
  });

  const activePlayers = handPlayers.filter((p: any) => p.status === 'ACTIVE');
  
  if (activePlayers.length === 0) {
    return false; // No active players
  }

  // Get all actions taken in the current round
  // Exclude POST_BLIND actions - those don't count as "acting" for round completion
  // The big blind still needs a chance to act (check/raise) when action comes back to them
  const roundActions = await (tx as any).handAction.findMany({
    where: {
      handId,
      round: currentRound,
      action: {
        not: 'POST_BLIND',
      },
    },
  });

  // Create a set of seat numbers that have acted in this round (excluding blind postings)
  const actedSeats = new Set(roundActions.map((a: any) => a.seatNumber));

  // Check that all active players have:
  // 1. Acted in this round (taken an action)
  // 2. Matched the current bet
  for (const player of activePlayers) {
    // Check if player has acted in this round
    if (!actedSeats.has(player.seatNumber)) {
      return false; // Player hasn't acted yet
    }

    // Check if player has matched the current bet
    const chipsCommitted = (player.chipsCommitted as bigint) || 0n;
    if (chipsCommitted < currentBet) {
      return false; // Player hasn't matched the bet
    }
  }

  return true; // All active players have acted and matched the bet
}

/**
 * Advances to the next betting round
 *
 * Deals community cards, resets betting state, and advances to next round.
 * If RIVER round completes, returns true to indicate hand should be settled.
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 * @returns True if hand should be settled (RIVER completed), false otherwise
 */
async function advanceBettingRound(handId: number, tx: any): Promise<boolean> {
  const hand = await (tx as any).hand.findUnique({
    where: { id: handId },
    include: {
      players: true,
    },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found`);
  }

  const currentRound = hand.round as BettingRound;
  const deck = hand.deck as Card[];
  const deckPosition = hand.deckPosition;
  const communityCards = (hand.communityCards || []) as Card[];

  let nextRound: BettingRound | null = null;
  let nextStatus: HandStatus = hand.status;
  let cardsToDeal: number = 0;

  // Determine next round
  switch (currentRound) {
    case 'PRE_FLOP':
      nextRound = 'FLOP';
      nextStatus = 'FLOP';
      cardsToDeal = 3;
      break;
    case 'FLOP':
      nextRound = 'TURN';
      nextStatus = 'TURN';
      cardsToDeal = 1;
      break;
    case 'TURN':
      nextRound = 'RIVER';
      nextStatus = 'RIVER';
      cardsToDeal = 1;
      break;
    case 'RIVER':
      // Hand should be settled
      return true;
    default:
      throw new Error(`Invalid betting round: ${currentRound}`);
  }

  // Deal community cards
  const newCommunityCards = [...communityCards];
  for (let i = 0; i < cardsToDeal; i++) {
    if (deckPosition + i >= deck.length) {
      throw new Error(`Deck position ${deckPosition + i} exceeds deck length`);
    }
    newCommunityCards.push(deck[deckPosition + i]);
  }

  // Get dealer position to determine first action seat
  const dealerPosition = hand.dealerPosition!;
  const handPlayers = hand.players as any[];

  // Find first active player after dealer (wrapping around)
  const sortedPlayers = handPlayers
    .filter((p: any) => p.status === 'ACTIVE')
    .sort((a: any, b: any) => a.seatNumber - b.seatNumber);

  if (sortedPlayers.length === 0) {
    throw new Error('No active players found for next betting round');
  }

  // Find dealer index in sorted active players
  const dealerIndex = sortedPlayers.findIndex((p: any) => p.seatNumber === dealerPosition);
  const firstActionIndex = (dealerIndex + 1) % sortedPlayers.length;
  const firstActionSeat = sortedPlayers[firstActionIndex].seatNumber;

  // Reset all active players' chips committed for new round
  for (const player of sortedPlayers) {
    await (tx as any).handPlayer.update({
      where: { id: player.id },
      data: {
        chipsCommitted: 0n,
      },
    });
  }

  // Update hand state
  await (tx as any).hand.update({
    where: { id: handId },
    data: {
      round: nextRound,
      status: nextStatus,
      communityCards: newCommunityCards as any,
      deckPosition: deckPosition + cardsToDeal,
      currentBet: 0n,
      lastRaiseAmount: null,
      currentActionSeat: firstActionSeat,
    },
  });

  return false; // Round advanced, hand not complete
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
 * Settles a hand via showdown (evaluates all active players' hands)
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 * @returns Settlement data including winners
 */
async function settleHandShowdown(handId: number, tx: any): Promise<{
  tableId: number;
  winnerSeatNumbers: number[];
  totalPotAmount: bigint;
  shuffleSeed: string;
  deck: any;
  handEvaluations: Array<{
    seatNumber: number;
    handRank: HandRank;
    handRankName: string;
    holeCards: Card[];
  }>;
}> {
  // Get hand with pots and players
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

  const communityCards = (hand.communityCards || []) as Card[];
  if (communityCards.length !== 5) {
    throw new Error(`Expected 5 community cards, got ${communityCards.length}`);
  }

  // Get all active players (not folded)
  const activePlayers = hand.players.filter((p: any) => p.status === 'ACTIVE');

  if (activePlayers.length === 0) {
    throw new Error('No active players found for showdown');
  }

  // Evaluate each player's hand
  const evaluations: Array<{
    seatNumber: number;
    evaluatedHand: EvaluatedHand;
  }> = [];

  for (const player of activePlayers) {
    const holeCards = player.holeCards as Card[];
    const evaluatedHand = evaluateHand(holeCards, communityCards);
    evaluations.push({
      seatNumber: player.seatNumber,
      evaluatedHand,
    });
  }

  // Find winners (players with best hand)
  let bestHand: EvaluatedHand | null = null;
  const winners: number[] = [];

  for (const evalResult of evaluations) {
    if (!bestHand) {
      bestHand = evalResult.evaluatedHand;
      winners.push(evalResult.seatNumber);
    } else {
      const comparison = compareHands(evalResult.evaluatedHand, bestHand);
      if (comparison > 0) {
        // This hand is better
        bestHand = evalResult.evaluatedHand;
        winners.length = 0;
        winners.push(evalResult.seatNumber);
      } else if (comparison === 0) {
        // This hand ties with best
        winners.push(evalResult.seatNumber);
      }
    }
  }

  // Calculate total pot amount
  let totalPotAmount = 0n;
  for (const pot of hand.pots) {
    totalPotAmount += pot.amount;
  }

  // Distribute pot to winners (split evenly if multiple winners)
  const potPerWinner = totalPotAmount / BigInt(winners.length);
  const remainder = totalPotAmount % BigInt(winners.length);

  for (let i = 0; i < winners.length; i++) {
    const winnerSeatNumber = winners[i];
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

    // Give winner their share (first winner gets remainder if pot doesn't divide evenly)
    const winnerAmount = potPerWinner + (i === 0 ? remainder : 0n);

    await tx.tableSeatSession.update({
      where: { id: winnerSession.id },
      data: {
        tableBalanceGwei: winnerSession.tableBalanceGwei + winnerAmount,
      },
    });
  }

  // Update pots with winners
  for (const pot of hand.pots) {
    await (tx as any).pot.update({
      where: { id: pot.id },
      data: {
        winnerSeatNumbers: winners as any,
      },
    });
  }

  // Get shuffle seed
  const shuffleSeed = hand.startedAt.getTime().toString();

  // Update hand status
  await (tx as any).hand.update({
    where: { id: handId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      shuffleSeed: shuffleSeed,
    },
  });

  // Build hand evaluations for event
  const handEvaluations = evaluations.map(evalResult => {
    const player = activePlayers.find((p: any) => p.seatNumber === evalResult.seatNumber);
    return {
      seatNumber: evalResult.seatNumber,
      handRank: evalResult.evaluatedHand.rank,
      handRankName: getHandRankName(evalResult.evaluatedHand.rank),
      holeCards: player ? (player.holeCards as Card[]) : [],
    };
  });

  return {
    tableId: hand.tableId,
    winnerSeatNumbers: winners,
    totalPotAmount,
    shuffleSeed,
    deck: hand.deck,
    handEvaluations,
  };
}

/**
 * Creates HAND_END event after hand settlement (single winner, all others folded)
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
      winnerSeatNumbers: [winnerSeatNumber],
      totalPotAmount: totalPotAmount.toString(),
      shuffleSeed, // Revealed seed for verification
      deck, // Full deck for verification
      completedAt: hand.completedAt?.toISOString(),
    },
    communityCards: (hand.communityCards || []) as Card[],
    players: hand.players.map((p: any) => ({
      seatNumber: p.seatNumber,
      walletAddress: p.walletAddress,
      holeCards: p.holeCards as Card[],
      status: p.status,
      handRank: null,
      handRankName: null,
    })),
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
 * Creates HAND_END event after hand settlement (showdown with hand evaluation)
 *
 * @param handId - Hand ID
 * @param winnerSeatNumbers - Array of winner seat numbers (for ties)
 * @param totalPotAmount - Total pot amount awarded
 * @param shuffleSeed - Revealed shuffle seed
 * @param deck - Full deck for verification
 */
async function createHandEndEventShowdown(
  handId: number,
  winnerSeatNumbers: number[],
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

  const communityCards = (hand.communityCards || []) as Card[];
  const activePlayers = hand.players.filter((p: any) => p.status === 'ACTIVE');

  // Evaluate hands for all active players
  const playerEvaluations: Array<{
    seatNumber: number;
    walletAddress: string;
    holeCards: Card[];
    status: string;
    handRank: HandRank;
    handRankName: string;
  }> = [];

  for (const player of activePlayers) {
    const holeCards = player.holeCards as Card[];
    const evaluatedHand = evaluateHand(holeCards, communityCards);
    playerEvaluations.push({
      seatNumber: player.seatNumber,
      walletAddress: player.walletAddress,
      holeCards,
      status: player.status,
      handRank: evaluatedHand.rank,
      handRankName: getHandRankName(evaluatedHand.rank),
    });
  }

  // Calculate pot per winner (for display)
  const potPerWinner = totalPotAmount / BigInt(winnerSeatNumbers.length);
  const remainder = totalPotAmount % BigInt(winnerSeatNumbers.length);

  const payload = {
    kind: 'hand_end',
    table: {
      id: hand.table.id,
      name: hand.table.name,
    },
    hand: {
      id: hand.id,
      winnerSeatNumbers,
      totalPotAmount: totalPotAmount.toString(),
      potPerWinner: potPerWinner.toString(),
      remainder: remainder.toString(),
      shuffleSeed, // Revealed seed for verification
      deck, // Full deck for verification
      completedAt: hand.completedAt?.toISOString(),
    },
    communityCards,
    players: hand.players.map((p: any) => {
      const evaluation = playerEvaluations.find(e => e.seatNumber === p.seatNumber);
      return {
        seatNumber: p.seatNumber,
        walletAddress: p.walletAddress,
        holeCards: p.holeCards as Card[],
        status: p.status,
        handRank: evaluation?.handRank || null,
        handRankName: evaluation?.handRankName || null,
      };
    }),
    pots: hand.pots.map((pot: any) => ({
      potNumber: pot.potNumber,
      amount: pot.amount.toString(),
      winnerSeatNumbers: Array.isArray(pot.winnerSeatNumbers) ? pot.winnerSeatNumbers : [],
      winners: winnerSeatNumbers.map((seatNum, index) => ({
        seatNumber: seatNum,
        amount: (potPerWinner + (index === 0 ? remainder : 0n)).toString(),
      })),
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
): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> {
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
  const result = await prisma.$transaction(async (tx): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> => {
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

      return { success: true, handEnded, roundAdvanced: false, tableId, winnerSeatNumber };
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
 * Processes a call action
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Calculates call amount (currentBet - chipsCommitted)
 * 3. Deducts from table balance and adds to pot
 * 4. Updates chips committed
 * 5. Creates call action record
 * 6. Checks if betting round is complete
 * 7. If round complete: advances betting round or settles hand
 * 8. If round not complete: advances to next active player
 *
 * After transaction:
 * - Creates HAND_END event if hand ended
 * - Starts new hand if conditions met
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address
 * @returns Success indicator with round advancement status
 * @throws {Error} If validation fails or transaction fails
 */
export async function callAction(
  tableId: number,
  walletAddress: string
): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> {
  const normalizedAddress = walletAddress.toLowerCase();

  type SettlementData = {
    handId: number;
    winnerSeatNumbers: number[];
    totalPotAmount: bigint;
    shuffleSeed: string;
    deck: any;
    isShowdown: boolean;
  };

  let settlementData: SettlementData | null = null;
  let roundAdvanced = false;

  const result = await prisma.$transaction(async (tx): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> => {
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
        pots: true,
      },
    });

    if (!hand) {
      throw new Error(`No active hand found for table ${tableId}`);
    }

    if (!hand.currentBet) {
      throw new Error('Cannot call when there is no current bet. Use check instead.');
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

    // 6. Calculate call amount
    const currentBet = hand.currentBet;
    if (!currentBet) {
      throw new Error('Cannot call when there is no current bet. Use check instead.');
    }
    const chipsCommitted = (handPlayer.chipsCommitted as bigint) || 0n;
    const callAmount: bigint = currentBet - chipsCommitted;

    if (callAmount <= 0n) {
      throw new Error('Call amount must be positive. Player may have already matched the bet.');
    }

    // 7. Validate player has sufficient balance
    if (seatSession.tableBalanceGwei < callAmount) {
      throw new Error(`Insufficient balance. Required: ${callAmount} gwei, Available: ${seatSession.tableBalanceGwei} gwei`);
    }

    // 8. Deduct from table balance
    await tx.tableSeatSession.update({
      where: { id: seatSession.id },
      data: {
        tableBalanceGwei: seatSession.tableBalanceGwei - callAmount,
      },
    });

    // 9. Update chips committed
    await (tx as any).handPlayer.update({
      where: { id: handPlayer.id },
      data: {
        chipsCommitted: currentBet,
      },
    });

    // 10. Add to main pot (pot 0)
    const mainPot = hand.pots.find((p: any) => p.potNumber === 0);
    if (!mainPot) {
      throw new Error('Main pot not found');
    }

    await (tx as any).pot.update({
      where: { id: mainPot.id },
      data: {
        amount: mainPot.amount + callAmount,
      },
    });

    // 11. Create call action record
    const handAction = await (tx as any).handAction.create({
      data: {
        handId: hand.id,
        seatNumber: seatSession.seatNumber,
        round: hand.round!,
        action: 'CALL',
        amount: callAmount,
      },
    });

    // 12. Create hand action event
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
        type: 'CALL',
        seatNumber: seatSession.seatNumber,
        walletAddress: normalizedAddress,
        amount: callAmount.toString(),
        timestamp: handAction.timestamp.toISOString(),
      },
    };
    const actionPayloadJson = JSON.stringify(actionPayload);
    await createEventInTransaction(tx, EventKind.BET, actionPayloadJson, normalizedAddress, null);

    // 13. Check if betting round is complete
    const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);

    let handEnded = false;
    let winnerSeatNumber: number | null = null;

    if (bettingRoundComplete) {
      // Check if this is the RIVER round (last round)
      if (hand.round === 'RIVER') {
        // Hand should be settled via showdown
        handEnded = true;
        const settlement = await settleHandShowdown(hand.id, tx);
        settlementData = {
          handId: hand.id,
          winnerSeatNumbers: settlement.winnerSeatNumbers,
          totalPotAmount: settlement.totalPotAmount,
          shuffleSeed: settlement.shuffleSeed,
          deck: settlement.deck,
          isShowdown: true,
        };
        // For now, return first winner (frontend can handle multiple winners)
        winnerSeatNumber = settlement.winnerSeatNumbers[0];
      } else {
        // Advance to next betting round
        roundAdvanced = true;
        const shouldSettle = await advanceBettingRound(hand.id, tx);
        if (shouldSettle) {
          // This shouldn't happen, but handle it
          handEnded = true;
          const settlement = await settleHandShowdown(hand.id, tx);
          settlementData = {
            handId: hand.id,
            winnerSeatNumbers: settlement.winnerSeatNumbers,
            totalPotAmount: settlement.totalPotAmount,
            shuffleSeed: settlement.shuffleSeed,
            deck: settlement.deck,
            isShowdown: true,
          };
          winnerSeatNumber = settlement.winnerSeatNumbers[0];
        }
      }
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

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  if (result.handEnded && settlementData) {
    // TypeScript type assertion needed because settlementData is assigned inside transaction callback
    const settlement: SettlementData = settlementData;
    await createHandEndEventShowdown(
      settlement.handId,
      settlement.winnerSeatNumbers,
      settlement.totalPotAmount,
      settlement.shuffleSeed,
      settlement.deck,
      tableId
    );

    await startNewHandIfPossible(tableId);
  }

  return result;
}

/**
 * Processes a check action
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Validates current bet is 0 or player has already matched
 * 3. Creates check action record
 * 4. Checks if betting round is complete
 * 5. If round complete: advances betting round or settles hand
 * 6. If round not complete: advances to next active player
 *
 * After transaction:
 * - Creates HAND_END event if hand ended
 * - Starts new hand if conditions met
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address
 * @returns Success indicator with round advancement status
 * @throws {Error} If validation fails or transaction fails
 */
export async function checkAction(
  tableId: number,
  walletAddress: string
): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> {
  const normalizedAddress = walletAddress.toLowerCase();

  type SettlementData = {
    handId: number;
    winnerSeatNumbers: number[];
    totalPotAmount: bigint;
    shuffleSeed: string;
    deck: any;
    isShowdown: boolean;
  };

  let settlementData: SettlementData | null = null;
  let roundAdvanced = false;

  const result = await prisma.$transaction(async (tx): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> => {
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

    // 6. Validate check is allowed (currentBet is 0 or player has matched)
    const currentBet = hand.currentBet || 0n;
    const chipsCommitted = handPlayer.chipsCommitted || 0n;

    if (currentBet > 0 && chipsCommitted < currentBet) {
      throw new Error(`Cannot check when there is a bet. Current bet: ${currentBet} gwei, Committed: ${chipsCommitted} gwei. Use call instead.`);
    }

    // 7. Create check action record
    const handAction = await (tx as any).handAction.create({
      data: {
        handId: hand.id,
        seatNumber: seatSession.seatNumber,
        round: hand.round!,
        action: 'CHECK',
        amount: null, // Check has no amount
      },
    });

    // 8. Create hand action event
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
        type: 'CHECK',
        seatNumber: seatSession.seatNumber,
        walletAddress: normalizedAddress,
        amount: null,
        timestamp: handAction.timestamp.toISOString(),
      },
    };
    const actionPayloadJson = JSON.stringify(actionPayload);
    await createEventInTransaction(tx, EventKind.BET, actionPayloadJson, normalizedAddress, null);

    // 9. Check if betting round is complete
    const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);

    let handEnded = false;
    let winnerSeatNumber: number | null = null;

    if (bettingRoundComplete) {
      // Check if this is the RIVER round (last round)
      if (hand.round === 'RIVER') {
        // Hand should be settled via showdown
        handEnded = true;
        const settlement = await settleHandShowdown(hand.id, tx);
        settlementData = {
          handId: hand.id,
          winnerSeatNumbers: settlement.winnerSeatNumbers,
          totalPotAmount: settlement.totalPotAmount,
          shuffleSeed: settlement.shuffleSeed,
          deck: settlement.deck,
          isShowdown: true,
        };
        winnerSeatNumber = settlement.winnerSeatNumbers[0];
      } else {
        // Advance to next betting round
        roundAdvanced = true;
        const shouldSettle = await advanceBettingRound(hand.id, tx);
        if (shouldSettle) {
          handEnded = true;
          const settlement = await settleHandShowdown(hand.id, tx);
          settlementData = {
            handId: hand.id,
            winnerSeatNumbers: settlement.winnerSeatNumbers,
            totalPotAmount: settlement.totalPotAmount,
            shuffleSeed: settlement.shuffleSeed,
            deck: settlement.deck,
            isShowdown: true,
          };
          winnerSeatNumber = settlement.winnerSeatNumbers[0];
        }
      }
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

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  if (result.handEnded && settlementData) {
    // TypeScript type assertion needed because settlementData is assigned inside transaction callback
    const settlement: SettlementData = settlementData;
    await createHandEndEventShowdown(
      settlement.handId,
      settlement.winnerSeatNumbers,
      settlement.totalPotAmount,
      settlement.shuffleSeed,
      settlement.deck,
      tableId
    );

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

