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
import {
  createSidePots,
  updatePotTotal,
  getMinimumRaiseAmount,
  getMinimumBetAmount,
  validateBetAmount,
  roundToIncrement,
} from './potSplitting';

// Types from Prisma schema
type HandStatus = 'WAITING_FOR_PLAYERS' | 'SHUFFLING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETED';
type HandPlayerStatus = 'ACTIVE' | 'FOLDED' | 'ALL_IN';
type BettingRound = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
type PlayerActionType = 'POST_BLIND' | 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN';

/**
 * Gets the next active player seat number (skips folded and all-in players)
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
    
    // Skip folded and all-in players, only return ACTIVE players who can still act
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

  // Get all players who haven't folded (ACTIVE and ALL_IN)
  const nonFoldedPlayers = handPlayers.filter((p: any) => p.status !== 'FOLDED');
  
  if (nonFoldedPlayers.length === 0) {
    return false; // No active players
  }

  // Separate ACTIVE players (who can still act) from ALL_IN players (who can't act further)
  const activePlayers = nonFoldedPlayers.filter((p: any) => p.status === 'ACTIVE');
  const allInPlayers = nonFoldedPlayers.filter((p: any) => p.status === 'ALL_IN');

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

  // Check that all ACTIVE players (who can still act) have:
  // 1. Acted in this round (taken an action)
  // 2. Matched the current bet
  for (const player of activePlayers) {
    // For ACTIVE players (not all-in), they must have acted
    if (!actedSeats.has(player.seatNumber)) {
      return false; // Player hasn't acted yet
    }

    // Check if player has matched the current bet
    const chipsCommitted = (player.chipsCommitted as bigint) || 0n;
    if (chipsCommitted < currentBet) {
      return false; // Player hasn't matched the bet
    }
  }

  // All-in players don't need to act - they've committed all they can
  // They're automatically considered to have "acted" since they can't act further
  // We just need to verify they've committed what they can (which is always true for all-in)

  // If there are no active players left (all are all-in), round is complete
  if (activePlayers.length === 0 && allInPlayers.length > 0) {
    return true; // All players are all-in, round is complete
  }

  // Round is complete if all ACTIVE players have acted and matched the bet
  return activePlayers.length === 0 || activePlayers.every((p: any) => {
    const chipsCommitted = (p.chipsCommitted as bigint) || 0n;
    return actedSeats.has(p.seatNumber) && chipsCommitted >= currentBet;
  });
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
  // Recalculate side pots before advancing to next round
  // (betting round is complete, so final pot structure is known)
  await createSidePots(handId, tx);

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

  // Get all non-folded players
  const nonFoldedPlayers = handPlayers.filter((p: any) => p.status !== 'FOLDED');
  
  // Find first active player after dealer (wrapping around)
  const sortedPlayers = handPlayers
    .filter((p: any) => p.status === 'ACTIVE')
    .sort((a: any, b: any) => a.seatNumber - b.seatNumber);

  // Check if all non-folded players are all-in
  const allInPlayers = nonFoldedPlayers.filter((p: any) => p.status === 'ALL_IN');
  const allPlayersAllIn = nonFoldedPlayers.length > 0 && allInPlayers.length === nonFoldedPlayers.length;

  let firstActionSeat: number | null = null;

  if (sortedPlayers.length === 0) {
    // No active players - either all folded or all all-in
    if (allPlayersAllIn) {
      // All remaining players are all-in - no one can act, so we don't need a currentActionSeat
      // The betting round will be immediately complete
      firstActionSeat = null;
    } else {
      // All players folded - this shouldn't happen (hand should have been settled)
      throw new Error('No active players found for next betting round');
    }
  } else {
    // Find dealer index in sorted active players
    const dealerIndex = sortedPlayers.findIndex((p: any) => p.seatNumber === dealerPosition);
    const firstActionIndex = dealerIndex >= 0 
      ? (dealerIndex + 1) % sortedPlayers.length
      : 0; // If dealer not in active players, start with first active player
    firstActionSeat = sortedPlayers[firstActionIndex].seatNumber;

    // Reset all active players' chips committed for new round
    for (const player of sortedPlayers) {
      await (tx as any).handPlayer.update({
        where: { id: player.id },
        data: {
          chipsCommitted: 0n,
        },
      });
    }
  }

  // Reset all-in players' chips committed for new round (they can't act but chips reset)
  for (const player of allInPlayers) {
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

  // If all players are all-in, the round is immediately complete
  // Return true if RIVER (settle hand), false otherwise (will advance again)
  if (allPlayersAllIn && nextRound === 'RIVER') {
    return true; // Hand should be settled
  }

  return false; // Round advanced, hand not complete
}

/**
 * Context for a player action, containing validated table, hand, seat session, and hand player
 */
type PlayerActionContext = {
  table: any;
  hand: any;
  seatSession: any;
  handPlayer: any;
};

/**
 * Gets and validates table and active hand for a player action
 *
 * @param tableId - Table ID
 * @param tx - Prisma transaction client
 * @param includePots - Whether to include pots in hand query (default: false)
 * @returns Object containing validated table and hand
 * @throws {Error} If table or hand not found or invalid
 */
async function getTableAndHand(
  tableId: number,
  tx: any,
  includePots: boolean = false
): Promise<{ table: any; hand: any }> {
  // Get table and validate
  const table = await tx.pokerTable.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw new Error(`Table with id ${tableId} not found`);
  }

  if (!table.isActive) {
    throw new Error(`Table ${table.name} is not active`);
  }

  // Get active hand
  const hand = await (tx as any).hand.findFirst({
    where: {
      tableId,
      status: {
        not: 'COMPLETED',
      },
    },
    include: {
      players: true,
      ...(includePots ? { pots: true } : {}),
    },
  });

  if (!hand) {
    throw new Error(`No active hand found for table ${tableId}`);
  }

  return { table, hand };
}

/**
 * Gets and validates player's seat session and hand player record
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address (normalized)
 * @param hand - Hand object with players array
 * @param tx - Prisma transaction client
 * @returns Object containing validated seat session and hand player
 * @throws {Error} If player not seated or not in hand
 */
async function getPlayerContext(
  tableId: number,
  walletAddress: string,
  hand: any,
  tx: any
): Promise<{ seatSession: any; handPlayer: any }> {
  // Get player's seat session
  const seatSession = await tx.tableSeatSession.findFirst({
    where: {
      tableId,
      walletAddress,
      isActive: true,
    },
  });

  if (!seatSession) {
    throw new Error(`Player not seated at table ${tableId}`);
  }

  // Get hand player record
  const handPlayer = hand.players.find(
    (p: any) => p.seatNumber === seatSession.seatNumber
  );

  if (!handPlayer) {
    throw new Error(`Player not in hand`);
  }

  if (handPlayer.status !== 'ACTIVE') {
    throw new Error(`Player already ${handPlayer.status.toLowerCase()}`);
  }

  return { seatSession, handPlayer };
}

/**
 * Validates that it's the player's turn to act
 *
 * @param hand - Hand object with currentActionSeat
 * @param seatNumber - Player's seat number
 * @throws {Error} If it's not the player's turn
 */
function validatePlayerTurn(hand: any, seatNumber: number): void {
  if (hand.currentActionSeat !== seatNumber) {
    throw new Error(`Not player's turn. Current action seat: ${hand.currentActionSeat}`);
  }
}

/**
 * Creates a HandAction record and creates an event.
 *
 * This helper ensures the correct order of operations:
 * 1. Create HandAction record
 * 2. Create hand action event
 *
 * Note: Pot splitting is deferred until betting round completes or player goes all-in.
 *
 * @param tx - Prisma transaction client
 * @param handId - Hand ID
 * @param seatNumber - Player's seat number
 * @param round - Current betting round
 * @param actionType - Type of action (CALL, RAISE, ALL_IN)
 * @param amount - Action amount (bigint or null for CHECK)
 * @param table - Table object with id and name
 * @param hand - Hand object with id, round, and status
 * @param walletAddress - Player's wallet address
 * @param eventActionType - Action type for event payload (may differ from DB action type, e.g., 'BET' vs 'RAISE')
 * @param isAllIn - Optional flag indicating if this was an all-in action
 * @returns The created HandAction record
 */
async function createActionAndEvent(
  tx: any,
  handId: number,
  seatNumber: number,
  round: BettingRound,
  actionType: 'CALL' | 'RAISE' | 'ALL_IN',
  amount: bigint | null,
  table: { id: number; name: string },
  hand: { id: number; round: BettingRound; status: HandStatus },
  walletAddress: string,
  eventActionType: 'CALL' | 'BET' | 'RAISE' | 'ALL_IN',
  isAllIn?: boolean
): Promise<any> {
  // 1. Create HandAction record
  const handAction = await (tx as any).handAction.create({
    data: {
      handId,
      seatNumber,
      round,
      action: actionType,
      amount,
    },
  });

  // 2. Update pot total (for UI display) - doesn't split, just updates total amount
  await updatePotTotal(handId, tx);

  // 3. Create hand action event
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
      type: eventActionType,
      seatNumber,
      walletAddress,
      amount: amount?.toString() || null,
      ...(isAllIn !== undefined ? { isAllIn } : {}),
      timestamp: handAction.timestamp.toISOString(),
    },
  };
  const actionPayloadJson = JSON.stringify(actionPayload);
  await createEventInTransaction(tx, EventKind.BET, actionPayloadJson, walletAddress, null);

  return handAction;
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
  // Ensure pots are calculated before settlement
  await createSidePots(handId, tx);

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
  // Ensure pots are calculated before settlement
  await createSidePots(handId, tx);

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

  // Get all non-folded players (ACTIVE and ALL_IN can both win pots)
  const nonFoldedPlayers = hand.players.filter((p: any) => p.status !== 'FOLDED');

  if (nonFoldedPlayers.length === 0) {
    throw new Error('No active players found for showdown');
  }

  // Evaluate each player's hand
  const evaluations: Array<{
    seatNumber: number;
    evaluatedHand: EvaluatedHand;
  }> = [];

  for (const player of nonFoldedPlayers) {
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

  // Distribute each pot separately based on eligible players
  // Each pot can have different winners based on which players are eligible
  const potWinners: Map<number, number[]> = new Map(); // potNumber -> winner seat numbers

  for (const pot of hand.pots) {
    const eligibleSeatNumbers = Array.isArray(pot.eligibleSeatNumbers)
      ? pot.eligibleSeatNumbers
      : [];

    // Find winners among eligible players only
    const eligibleEvaluations = evaluations.filter((e) =>
      eligibleSeatNumbers.includes(e.seatNumber)
    );

    if (eligibleEvaluations.length === 0) {
      // No eligible players (shouldn't happen, but handle it)
      potWinners.set(pot.potNumber, []);
      continue;
    }

    // Find best hand among eligible players
    let potBestHand: EvaluatedHand | null = null;
    const potWinnersList: number[] = [];

    for (const evalResult of eligibleEvaluations) {
      if (!potBestHand) {
        potBestHand = evalResult.evaluatedHand;
        potWinnersList.push(evalResult.seatNumber);
      } else {
        const comparison = compareHands(evalResult.evaluatedHand, potBestHand);
        if (comparison > 0) {
          // This hand is better
          potBestHand = evalResult.evaluatedHand;
          potWinnersList.length = 0;
          potWinnersList.push(evalResult.seatNumber);
        } else if (comparison === 0) {
          // This hand ties with best
          potWinnersList.push(evalResult.seatNumber);
        }
      }
    }

    potWinners.set(pot.potNumber, potWinnersList);

    // Update pot with winners
    await (tx as any).pot.update({
      where: { id: pot.id },
      data: {
        winnerSeatNumbers: potWinnersList as any,
      },
    });
  }

  // Distribute winnings to players
  // Track total winnings per player across all pots
  const playerWinnings: Map<number, bigint> = new Map();

  for (const pot of hand.pots) {
    const winners = potWinners.get(pot.potNumber) || [];
    if (winners.length === 0) {
      continue; // No winners for this pot (shouldn't happen)
    }

    // Split pot evenly among winners
    const potPerWinner = pot.amount / BigInt(winners.length);
    const remainder = pot.amount % BigInt(winners.length);

    for (let i = 0; i < winners.length; i++) {
      const winnerSeatNumber = winners[i];
      const winnerAmount = potPerWinner + (i === 0 ? remainder : 0n);
      const currentWinnings = playerWinnings.get(winnerSeatNumber) || 0n;
      playerWinnings.set(winnerSeatNumber, currentWinnings + winnerAmount);
    }
  }

  // Update table balances for all winners
  for (const [seatNumber, winnings] of playerWinnings.entries()) {
    const winnerSession = await tx.tableSeatSession.findFirst({
      where: {
        tableId: hand.tableId,
        seatNumber,
        isActive: true,
      },
    });

    if (!winnerSession) {
      throw new Error(`Winner session not found for seat ${seatNumber}`);
    }

    await tx.tableSeatSession.update({
      where: { id: winnerSession.id },
      data: {
        tableBalanceGwei: winnerSession.tableBalanceGwei + winnings,
      },
    });
  }

  // Collect all unique winners across all pots for return value
  const allWinners = Array.from(new Set(Array.from(potWinners.values()).flat()));

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
    const player = nonFoldedPlayers.find((p: any) => p.seatNumber === evalResult.seatNumber);
    return {
      seatNumber: evalResult.seatNumber,
      handRank: evalResult.evaluatedHand.rank,
      handRankName: getHandRankName(evalResult.evaluatedHand.rank),
      holeCards: player ? (player.holeCards as Card[]) : [],
    };
  });

  return {
    tableId: hand.tableId,
    winnerSeatNumbers: allWinners.length > 0 ? allWinners : winners, // Fallback to original winners if no pot winners
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
  const nonFoldedPlayers = hand.players.filter((p: any) => p.status !== 'FOLDED');

  // Evaluate hands for all non-folded players (ACTIVE and ALL_IN)
  const playerEvaluations: Array<{
    seatNumber: number;
    walletAddress: string;
    holeCards: Card[];
    status: string;
    handRank: HandRank;
    handRankName: string;
  }> = [];

  for (const player of nonFoldedPlayers) {
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
      // Only show hand rank for non-folded players
      const showHandRank = p.status !== 'FOLDED';
      return {
        seatNumber: p.seatNumber,
        walletAddress: p.walletAddress,
        holeCards: p.holeCards as Card[],
        status: p.status,
        handRank: showHandRank ? (evaluation?.handRank || null) : null,
        handRankName: showHandRank ? (evaluation?.handRankName || null) : null,
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
 * Settlement data for single winner (fold scenario)
 */
type SingleWinnerSettlementData = {
  handId: number;
  winnerSeatNumber: number;
  totalPotAmount: bigint;
  shuffleSeed: string;
  deck: any;
};

/**
 * Settlement data for showdown (multiple winners possible)
 */
type ShowdownSettlementData = {
  handId: number;
  winnerSeatNumbers: number[];
  totalPotAmount: bigint;
  shuffleSeed: string;
  deck: any;
  isShowdown: boolean;
};

/**
 * Handles post-transaction work after a player action
 *
 * Creates HAND_END event if hand ended and starts new hand if conditions are met.
 *
 * @param result - Action result with handEnded flag
 * @param settlementData - Settlement data (single winner or showdown)
 * @param tableId - Table ID
 */
async function handlePostActionSettlement(
  result: { handEnded: boolean; tableId: number },
  settlementData: SingleWinnerSettlementData | ShowdownSettlementData | null,
  tableId: number
): Promise<void> {
  if (!result.handEnded || !settlementData) {
    return;
  }

  // Check if this is a showdown settlement (has winnerSeatNumbers array)
  if ('winnerSeatNumbers' in settlementData && settlementData.isShowdown) {
    // Showdown settlement (multiple winners possible)
    await createHandEndEventShowdown(
      settlementData.handId,
      settlementData.winnerSeatNumbers,
      settlementData.totalPotAmount,
      settlementData.shuffleSeed,
      settlementData.deck,
      tableId
    );
  } else if ('winnerSeatNumber' in settlementData) {
    // Single winner settlement (fold scenario)
    await createHandEndEvent(
      settlementData.handId,
      settlementData.winnerSeatNumber,
      settlementData.totalPotAmount,
      settlementData.shuffleSeed,
      settlementData.deck,
      tableId
    );
  }

  // Start new hand if conditions are met
  await startNewHandIfPossible(tableId);
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
    winnerSeatNumber?: number;
    winnerSeatNumbers?: number[];
    totalPotAmount: bigint;
    shuffleSeed: string;
    deck: any;
    isShowdown?: boolean;
  };

  let settlementData: SettlementData | null = null;
  let roundAdvanced = false;

  // Use transaction directly so we can build complete event payload with hand data
  const result = await prisma.$transaction(async (tx): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> => {
      // 1. Get table and hand (validated)
      const { table, hand } = await getTableAndHand(tableId, tx, false);

      // 2. Get player context (validated)
      const { seatSession, handPlayer } = await getPlayerContext(
        tableId,
        normalizedAddress,
        hand,
        tx
      );

      // 3. Validate it's the player's turn
      validatePlayerTurn(hand, seatSession.seatNumber);

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

      // 9. Count remaining non-folded players (after fold)
      // Get all players to check how many haven't folded
      const updatedPlayers = await (tx as any).handPlayer.findMany({
        where: { handId: hand.id },
      });
      const nonFoldedPlayers = updatedPlayers.filter((p: any) => p.status !== 'FOLDED');

      let handEnded = false;
      let winnerSeatNumber: number | null = null;

      if (nonFoldedPlayers.length === 1) {
        // Hand ends - only one player remains (could be ACTIVE or ALL_IN)
        handEnded = true;
        
        const remainingPlayer = nonFoldedPlayers[0];
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
          // All remaining players are all-in, round should complete
          // Check if betting round is complete
          const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);
          if (bettingRoundComplete) {
            // Advance to next betting round or settle hand
            // Keep advancing rounds until RIVER (since all players are all-in, no one can act)
            let currentRound = hand.round;
            let shouldSettle = false;
            
            while (currentRound !== 'RIVER' && !shouldSettle) {
              roundAdvanced = true;
              shouldSettle = await advanceBettingRound(hand.id, tx);
              if (shouldSettle) {
                // Reached RIVER, settle the hand
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
                break;
              }
              // Get updated hand to check current round
              const updatedHand = await (tx as any).hand.findUnique({
                where: { id: hand.id },
              });
              currentRound = updatedHand.round as BettingRound;
            }
            
            // If we didn't settle yet but are at RIVER, settle now
            if (!handEnded && currentRound === 'RIVER') {
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
          } else {
            throw new Error('No next active player found and betting round is not complete');
          }
        } else {
          await (tx as any).hand.update({
            where: { id: hand.id },
            data: {
              currentActionSeat: nextSeat,
            },
          });
        }
      }

      return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  await handlePostActionSettlement(result, settlementData, tableId);

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
    // 1. Get table and hand (validated)
    const { table, hand } = await getTableAndHand(tableId, tx, true);

    if (!hand.currentBet) {
      throw new Error('Cannot call when there is no current bet. Use check instead.');
    }

    // 2. Get player context (validated)
    const { seatSession, handPlayer } = await getPlayerContext(
      tableId,
      normalizedAddress,
      hand,
      tx
    );

    // 3. Validate it's the player's turn
    validatePlayerTurn(hand, seatSession.seatNumber);

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

    // 10. Create call action record and event (pot splitting deferred until round completes)
    const handAction = await createActionAndEvent(
      tx,
      hand.id,
      seatSession.seatNumber,
      hand.round!,
      'CALL',
      callAmount,
      table,
      hand,
      normalizedAddress,
      'CALL'
    );

    // 11. Check if betting round is complete
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
        // All remaining players are all-in, round should complete
        // Check if betting round is complete
        const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);
        if (bettingRoundComplete) {
          // Advance to next betting round or settle hand
          if (hand.round === 'RIVER') {
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
          throw new Error('No next active player found and betting round is not complete');
        }
      } else {
        await (tx as any).hand.update({
          where: { id: hand.id },
          data: {
            currentActionSeat: nextSeat,
          },
        });
      }
    }

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  await handlePostActionSettlement(result, settlementData, tableId);

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
    // 1. Get table and hand (validated)
    const { table, hand } = await getTableAndHand(tableId, tx, false);

    // 2. Get player context (validated)
    const { seatSession, handPlayer } = await getPlayerContext(
      tableId,
      normalizedAddress,
      hand,
      tx
    );

    // 3. Validate it's the player's turn
    validatePlayerTurn(hand, seatSession.seatNumber);

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
        // All remaining players are all-in, round should complete
        // Check if betting round is complete
        const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);
        if (bettingRoundComplete) {
          // Advance to next betting round or settle hand
          if (hand.round === 'RIVER') {
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
          throw new Error('No next active player found and betting round is not complete');
        }
      } else {
        await (tx as any).hand.update({
          where: { id: hand.id },
          data: {
            currentActionSeat: nextSeat,
          },
        });
      }
    }

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  await handlePostActionSettlement(result, settlementData, tableId);

  return result;
}

/**
 * Processes a bet action (first bet when currentBet is 0)
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Validates amount (≥ minimum bet, ≤ balance, in increments)
 * 3. Deducts from table balance
 * 4. Updates chips committed and current bet
 * 5. Creates bet action record
 * 6. Recalculates side pots if needed
 * 7. Checks if betting round is complete
 * 8. Advances turn or round as needed
 *
 * After transaction:
 * - Creates HAND_END event if hand ended
 * - Starts new hand if conditions met
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address
 * @param amountGwei - Total bet amount in gwei (must be ≥ big blind)
 * @returns Success indicator with round advancement status
 * @throws {Error} If validation fails or transaction fails
 */
export async function betAction(
  tableId: number,
  walletAddress: string,
  amountGwei: bigint
): Promise<{ success: boolean; handEnded: boolean; roundAdvanced: boolean; tableId: number; winnerSeatNumber: number | null }> {
  return await raiseAction(tableId, walletAddress, amountGwei, true);
}

/**
 * Processes a raise action (increase the bet)
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Validates amount (≥ minimum raise, ≤ balance, in increments)
 * 3. Deducts from table balance
 * 4. Updates chips committed and current bet
 * 5. Updates lastRaiseAmount
 * 6. Creates raise action record
 * 7. Recalculates side pots if needed
 * 8. Checks if betting round is complete
 * 9. Advances turn or round as needed
 *
 * After transaction:
 * - Creates HAND_END event if hand ended
 * - Starts new hand if conditions met
 *
 * @param tableId - Table ID
 * @param walletAddress - Player's wallet address
 * @param amountGwei - Total bet amount in gwei (must be ≥ currentBet + minimumRaise)
 * @param isBet - Whether this is a bet (currentBet === 0) or raise
 * @returns Success indicator with round advancement status
 * @throws {Error} If validation fails or transaction fails
 */
export async function raiseAction(
  tableId: number,
  walletAddress: string,
  amountGwei: bigint,
  isBet: boolean = false
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
    // 1. Get table and hand (validated)
    const { table, hand } = await getTableAndHand(tableId, tx, true);

    // 2. Validate bet vs raise
    const currentBet = hand.currentBet || 0n;
    if (isBet && currentBet > 0n) {
      throw new Error('Cannot bet when there is a current bet. Use raise instead.');
    }
    if (!isBet && currentBet === 0n) {
      throw new Error('Cannot raise when there is no current bet. Use bet instead.');
    }

    // 3. Get player context (validated)
    const { seatSession, handPlayer } = await getPlayerContext(
      tableId,
      normalizedAddress,
      hand,
      tx
    );

    // 4. Validate it's the player's turn
    validatePlayerTurn(hand, seatSession.seatNumber);

    // 7. Round amount to nearest big blind increment
    const roundedAmount = roundToIncrement(amountGwei, table.bigBlind);
    if (roundedAmount !== amountGwei) {
      throw new Error(`Bet amount must be in increments of ${table.bigBlind} gwei (big blind). Rounded: ${roundedAmount} gwei`);
    }

    // 8. Get minimum bet/raise amount
    const minimumRaise = isBet
      ? getMinimumBetAmount(table)
      : getMinimumRaiseAmount(hand, table);

    // 9. Validate bet amount
    const chipsCommitted = (handPlayer.chipsCommitted as bigint) || 0n;
    const validation = validateBetAmount(
      roundedAmount,
      currentBet,
      chipsCommitted,
      seatSession.tableBalanceGwei,
      minimumRaise,
      table.bigBlind
    );

    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid bet amount');
    }

    // 10. Check if this makes player all-in
    const additionalNeeded = roundedAmount - chipsCommitted;
    const isAllIn = seatSession.tableBalanceGwei <= additionalNeeded;
    const actualBetAmount = isAllIn
      ? chipsCommitted + seatSession.tableBalanceGwei
      : roundedAmount;

    // 11. Calculate incremental amount (what's being added in this action)
    const amountToDeduct = actualBetAmount - chipsCommitted;
    
    // Deduct from table balance
    await tx.tableSeatSession.update({
      where: { id: seatSession.id },
      data: {
        tableBalanceGwei: seatSession.tableBalanceGwei - amountToDeduct,
      },
    });

    // 12. Update chips committed and hand state
    await (tx as any).handPlayer.update({
      where: { id: handPlayer.id },
      data: {
        chipsCommitted: actualBetAmount,
        status: isAllIn ? 'ALL_IN' : 'ACTIVE',
      },
    });

    // 13. Update hand betting state
    const raiseAmount = actualBetAmount - currentBet;
    const newLastRaiseAmount = raiseAmount > 0n ? raiseAmount : hand.lastRaiseAmount;

    await (tx as any).hand.update({
      where: { id: hand.id },
      data: {
        currentBet: actualBetAmount,
        lastRaiseAmount: newLastRaiseAmount,
      },
    });

    // 14. Create bet/raise action record and event
    // Store incremental amount (amountToDeduct) instead of total (actualBetAmount)
    // Pot splitting deferred until round completes or player goes all-in
    const handAction = await createActionAndEvent(
      tx,
      hand.id,
      seatSession.seatNumber,
      hand.round!,
      'RAISE',
      amountToDeduct, // Store incremental amount, not total
      table,
      hand,
      normalizedAddress,
      isBet ? 'BET' : 'RAISE', // Use BET/RAISE in event payload for clarity
      isAllIn
    );

    // 15. If player went all-in, recalculate side pots immediately
    // (all-in players can't match further raises, so side pots are needed now)
    if (isAllIn) {
      await createSidePots(hand.id, tx);
    }

    // 17. Check if betting round is complete
    const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);

    let handEnded = false;
    let winnerSeatNumber: number | null = null;

    if (bettingRoundComplete) {
      // Betting round is complete - recalculate side pots now (if not already done for all-in)
      if (!isAllIn) {
        await createSidePots(hand.id, tx);
      }

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
      // Advance to next active player (skip all-in players)
      const nextSeat = await getNextActivePlayer(hand.id, seatSession.seatNumber, tx);
      
      if (nextSeat === null) {
        // All remaining players are all-in, round should complete
        // This shouldn't happen if isBettingRoundComplete is correct, but handle it
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
      } else {
        await (tx as any).hand.update({
          where: { id: hand.id },
          data: {
            currentActionSeat: nextSeat,
          },
        });
      }
    }

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  await handlePostActionSettlement(result, settlementData, tableId);

  return result;
}

/**
 * Processes an all-in action
 *
 * Atomically:
 * 1. Validates it's the player's turn
 * 2. Sets chipsCommitted to entire table balance
 * 3. Deducts entire balance
 * 4. Marks player as ALL_IN
 * 5. Updates current bet if this exceeds it
 * 6. Creates all-in action record
 * 7. Recalculates side pots
 * 8. Checks if betting round is complete
 * 9. Advances turn or round as needed
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
export async function allInAction(
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
    // 1. Get table and hand (validated)
    const { table, hand } = await getTableAndHand(tableId, tx, true);

    // 2. Get player context (validated)
    const { seatSession, handPlayer } = await getPlayerContext(
      tableId,
      normalizedAddress,
      hand,
      tx
    );

    // 3. Validate it's the player's turn
    validatePlayerTurn(hand, seatSession.seatNumber);

    // 6. Calculate all-in amount
    const chipsCommitted = (handPlayer.chipsCommitted as bigint) || 0n;
    const allInAmount = chipsCommitted + seatSession.tableBalanceGwei;
    const currentBet = hand.currentBet || 0n;
    const incrementalAmount = seatSession.tableBalanceGwei; // Amount being added

    // 7. Deduct entire balance
    await tx.tableSeatSession.update({
      where: { id: seatSession.id },
      data: {
        tableBalanceGwei: 0n,
      },
    });

    // 8. Update chips committed and mark as all-in
    await (tx as any).handPlayer.update({
      where: { id: handPlayer.id },
      data: {
        chipsCommitted: allInAmount,
        status: 'ALL_IN',
      },
    });

    // 9. Update hand betting state if this exceeds current bet
    if (allInAmount > currentBet) {
      const raiseAmount = allInAmount - currentBet;
      await (tx as any).hand.update({
        where: { id: hand.id },
        data: {
          currentBet: allInAmount,
          lastRaiseAmount: raiseAmount,
        },
      });
    }

    // 10. Create all-in action record and event
    // Store incremental amount (incrementalAmount) instead of total (allInAmount)
    const handAction = await createActionAndEvent(
      tx,
      hand.id,
      seatSession.seatNumber,
      hand.round!,
      'ALL_IN',
      incrementalAmount, // Store incremental amount, not total
      table,
      hand,
      normalizedAddress,
      'ALL_IN',
      true
    );

    // 11. Recalculate side pots immediately (all-in players can't match further raises)
    await createSidePots(hand.id, tx);

    // 12. Check if betting round is complete
    const bettingRoundComplete = await isBettingRoundComplete(hand.id, tx);

    let handEnded = false;
    let winnerSeatNumber: number | null = null;

    if (bettingRoundComplete) {
      // Betting round is complete - pots already recalculated above for all-in
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
      // Advance to next active player (skip all-in players)
      const nextSeat = await getNextActivePlayer(hand.id, seatSession.seatNumber, tx);
      
      if (nextSeat === null) {
        // All remaining players are all-in, round should complete
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
      } else {
        await (tx as any).hand.update({
          where: { id: hand.id },
          data: {
            currentActionSeat: nextSeat,
          },
        });
      }
    }

    return { success: true, handEnded, roundAdvanced, tableId, winnerSeatNumber };
  });

  // After transaction completes, handle post-settlement work
  await handlePostActionSettlement(result, settlementData, tableId);

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

