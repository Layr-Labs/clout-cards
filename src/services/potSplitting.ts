/**
 * Pot splitting service
 *
 * Handles creation and management of side pots when players go all-in
 * with different stack sizes. Ensures proper pot distribution and eligibility.
 */

import { prisma } from '../db/client';

/**
 * Updates the total pot amount without splitting into side pots.
 *
 * This is called after every action to keep the pot amount visible in the UI.
 * It creates or updates a single pot (pot 0) with the total chips committed.
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 */
export async function updatePotTotal(handId: number, tx: any): Promise<void> {
  // Get all active players (not folded)
  const handPlayers = await (tx as any).handPlayer.findMany({
    where: { handId },
  });

  const activePlayers = handPlayers.filter((p: any) => p.status !== 'FOLDED');

  if (activePlayers.length === 0) {
    return; // No active players, no pot to update
  }

  // Get all HandAction records for this hand to calculate total chips committed
  const allActions = await (tx as any).handAction.findMany({
    where: { handId },
    orderBy: [{ round: 'asc' }, { timestamp: 'asc' }],
  });

  // Calculate total chips committed per player across all rounds
  // All actions store incremental amounts - simply sum them
  const playerRoundTotals = new Map<string, bigint>(); // key: "seatNumber-round"

  // Process all actions - sum incremental amounts per player per round
  for (const action of allActions) {
    const seatNumber = action.seatNumber;
    const round = action.round;
    const actionType = action.action;
    const amount = (action.amount as bigint) || 0n;

    // Skip if player folded (they're not in activePlayers, but check anyway)
    const player = activePlayers.find((p: any) => p.seatNumber === seatNumber);
    if (!player) {
      continue; // Player folded, skip their actions
    }

    // Skip CHECK and FOLD actions (no amount)
    if (actionType === 'CHECK' || actionType === 'FOLD') {
      continue;
    }

    const roundKey = `${seatNumber}-${round}`;
    const currentRoundTotal = playerRoundTotals.get(roundKey) || 0n;
    playerRoundTotals.set(roundKey, currentRoundTotal + amount);
  }

  // Sum across all rounds for each player
  const playerTotals = new Map<number, bigint>();
  for (const [roundKey, roundTotal] of playerRoundTotals) {
    const seatNumber = parseInt(roundKey.split('-')[0]);
    const currentTotal = playerTotals.get(seatNumber) || 0n;
    playerTotals.set(seatNumber, currentTotal + roundTotal);
  }

  // Calculate total chips committed by all active players
  const totalChipsCommitted = Array.from(playerTotals.values()).reduce(
    (sum: bigint, total: bigint) => sum + total,
    0n
  );

  // Get or create pot 0
  const existingPot = await (tx as any).pot.findFirst({
    where: { handId, potNumber: 0 },
  });

  if (existingPot) {
    // Update existing pot 0 with total amount
    await (tx as any).pot.update({
      where: { id: existingPot.id },
      data: {
        amount: totalChipsCommitted,
        eligibleSeatNumbers: activePlayers.map((p: any) => p.seatNumber) as any,
      },
    });
  } else {
    // Create pot 0 if it doesn't exist
    await (tx as any).pot.create({
      data: {
        handId,
        potNumber: 0,
        amount: totalChipsCommitted,
        eligibleSeatNumbers: activePlayers.map((p: any) => p.seatNumber) as any,
        winnerSeatNumbers: null,
      },
    });
  }
}

/**
 * Checks if side pots should be created (commitments differ between players)
 *
 * Side pots are only needed when non-folded players who have ALREADY ACTED in the current round
 * have different total commitment levels. We don't consider players who haven't acted yet,
 * as their final commitment level is unknown.
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 * @returns True if side pots should be created (commitments differ among players who have acted), false otherwise
 */
export async function shouldCreateSidePots(handId: number, tx: any): Promise<boolean> {
  // Get current hand to determine the current round
  const hand = await (tx as any).hand.findUnique({
    where: { id: handId },
  });

  if (!hand || !hand.round) {
    return false; // Can't determine if side pots needed without current round
  }

  const currentRound = hand.round;

  // Get all active players (not folded)
  const handPlayers = await (tx as any).handPlayer.findMany({
    where: { handId },
  });

  const activePlayers = handPlayers.filter((p: any) => p.status !== 'FOLDED');

  // Need at least 2 players for commitments to differ
  if (activePlayers.length < 2) {
    return false;
  }

  // Get all actions taken in the current round (excluding POST_BLIND)
  // Only players who have acted in the current round should be considered
  const currentRoundActions = await (tx as any).handAction.findMany({
    where: {
      handId,
      round: currentRound,
      action: {
        not: 'POST_BLIND',
      },
    },
  });

  // Create a set of seat numbers that have acted in the current round
  const actedSeats = new Set(currentRoundActions.map((a: any) => a.seatNumber));

  // Also include ALL_IN players (they've effectively "acted" by going all-in)
  const allInPlayers = activePlayers.filter((p: any) => p.status === 'ALL_IN');
  for (const player of allInPlayers) {
    actedSeats.add(player.seatNumber);
  }

  // Only consider players who have acted in the current round
  const playersWhoHaveActed = activePlayers.filter((p: any) => actedSeats.has(p.seatNumber));

  // Need at least 2 players who have acted for commitments to differ
  if (playersWhoHaveActed.length < 2) {
    return false; // Not enough players have acted yet to determine if side pots are needed
  }

  // Get all HandAction records to calculate total chips committed per player
  const allActions = await (tx as any).handAction.findMany({
    where: { handId },
    orderBy: [{ round: 'asc' }, { timestamp: 'asc' }],
  });

  // Calculate total chips committed per player across all rounds
  const playerRoundTotals = new Map<string, bigint>(); // key: "seatNumber-round"

  for (const action of allActions) {
    const seatNumber = action.seatNumber;
    const round = action.round;
    const actionType = action.action;
    const amount = (action.amount as bigint) || 0n;

    // Skip if player folded
    const player = activePlayers.find((p: any) => p.seatNumber === seatNumber);
    if (!player) {
      continue;
    }

    // Skip CHECK and FOLD actions (no amount)
    if (actionType === 'CHECK' || actionType === 'FOLD') {
      continue;
    }

    const roundKey = `${seatNumber}-${round}`;
    const currentRoundTotal = playerRoundTotals.get(roundKey) || 0n;
    playerRoundTotals.set(roundKey, currentRoundTotal + amount);
  }

  // Sum across all rounds for each player
  const playerTotals = new Map<number, bigint>();
  for (const [roundKey, roundTotal] of playerRoundTotals) {
    const seatNumber = parseInt(roundKey.split('-')[0]);
    const currentTotal = playerTotals.get(seatNumber) || 0n;
    playerTotals.set(seatNumber, currentTotal + roundTotal);
  }

  // Get unique commitment levels ONLY for players who have acted in the current round
  const commitmentLevels = new Set<bigint>();
  for (const player of playersWhoHaveActed) {
    const total = playerTotals.get(player.seatNumber) || 0n;
    commitmentLevels.add(total);
  }

  // Side pots are needed if there are different commitment levels among players who have acted
  return commitmentLevels.size > 1;
}

/**
 * Creates side pots based on player commitments
 *
 * When players go all-in with different amounts, we need to create side pots
 * so that each player can only win the amount they're eligible for.
 *
 * Algorithm:
 * 1. Calculate total chips committed per player across ALL rounds from HandAction records
 * 2. Sort players by total committed (ascending)
 * 3. For each unique commitment level:
 *    - Calculate pot amount: (level - previous_level) * number_of_eligible_players
 *    - Eligible players: All players who committed >= this level
 * 4. Create pots in order (pot 0 = lowest commitment, pot N = highest)
 *
 * Note: We calculate from HandAction records because chipsCommitted resets between rounds,
 * but we need cumulative totals across all rounds for proper pot splitting.
 *
 * Example:
 * - Player A: committed 100
 * - Player B: committed 50 (all-in)
 * - Player C: committed 100
 * Result:
 *   - Pot 0: 50 * 3 = 150 (all eligible)
 *   - Pot 1: 50 * 2 = 100 (A and C eligible, B can't win this)
 *
 * @param handId - Hand ID
 * @param tx - Prisma transaction client
 */
export async function createSidePots(handId: number, tx: any): Promise<void> {
  // Get all active players (not folded)
  const handPlayers = await (tx as any).handPlayer.findMany({
    where: { handId },
  });

  const activePlayers = handPlayers.filter((p: any) => p.status !== 'FOLDED');

  if (activePlayers.length === 0) {
    throw new Error('No active players found for pot creation');
  }

  // Get all HandAction records for this hand to calculate total chips committed
  const allActions = await (tx as any).handAction.findMany({
    where: { handId },
    orderBy: [{ round: 'asc' }, { timestamp: 'asc' }],
  });

  // Calculate total chips committed per player across all rounds
  // All actions now store incremental amounts (POST_BLIND, CALL, RAISE, ALL_IN)
  // Simply sum all actions per player per round, then sum across rounds
  const playerRoundTotals = new Map<string, bigint>(); // key: "seatNumber-round", tracks total per round

  // Initialize totals
  for (const player of activePlayers) {
    // Initialize for all rounds (we'll populate as we process actions)
  }

  // Process all actions - sum incremental amounts per player per round
  for (const action of allActions) {
    const seatNumber = action.seatNumber;
    const round = action.round;
    const actionType = action.action;
    const amount = (action.amount as bigint) || 0n;

    // Skip if player folded (they're not in activePlayers, but check anyway)
    const player = activePlayers.find((p: any) => p.seatNumber === seatNumber);
    if (!player) {
      continue; // Player folded, skip their actions
    }

    // Skip CHECK and FOLD actions (no amount)
    if (actionType === 'CHECK' || actionType === 'FOLD') {
      continue;
    }

    const roundKey = `${seatNumber}-${round}`;
    const currentRoundTotal = playerRoundTotals.get(roundKey) || 0n;
    playerRoundTotals.set(roundKey, currentRoundTotal + amount);
  }

  // Sum across all rounds for each player
  const playerTotals = new Map<number, bigint>();
  for (const [roundKey, roundTotal] of playerRoundTotals) {
    const seatNumber = parseInt(roundKey.split('-')[0]);
    const currentTotal = playerTotals.get(seatNumber) || 0n;
    playerTotals.set(seatNumber, currentTotal + roundTotal);
  }

  // Get unique commitment levels, sorted ascending
  const commitmentLevels: bigint[] = Array.from(
    new Set<bigint>(Array.from(playerTotals.values()))
  ).sort((a: bigint, b: bigint) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  // Calculate total chips committed by all active players
  const totalChipsCommitted = Array.from(playerTotals.values()).reduce(
    (sum: bigint, total: bigint) => sum + total,
    0n
  );

  // Delete all existing pots (we'll recreate them)
  await (tx as any).pot.deleteMany({
    where: { handId },
  });

  // Create side pots for each commitment level
  let previousLevel = 0n;
  let potNumber = 0;

  for (const level of commitmentLevels) {
    const levelBigInt = level as bigint;
    // Find all players eligible for this pot (total committed >= this level)
    const eligiblePlayers = activePlayers.filter(
      (p: any) => (playerTotals.get(p.seatNumber) || 0n) >= levelBigInt
    );

    if (eligiblePlayers.length === 0) {
      continue; // Skip if no eligible players (shouldn't happen)
    }

    // Calculate pot amount: (current_level - previous_level) * number_of_eligible_players
    const levelDifference = levelBigInt - previousLevel;
    const potAmount = levelDifference * BigInt(eligiblePlayers.length);

    // Create pot
    await (tx as any).pot.create({
      data: {
        handId,
        potNumber,
        amount: potAmount,
        eligibleSeatNumbers: eligiblePlayers.map((p: any) => p.seatNumber) as any,
        winnerSeatNumbers: null,
      },
    });

    previousLevel = levelBigInt;
    potNumber++;
  }

  // Verify total pot amount matches total chips committed
  const newPots = await (tx as any).pot.findMany({
    where: { handId },
  });

  const totalPotAmount = newPots.reduce(
    (sum: bigint, pot: any) => sum + (pot.amount as bigint),
    0n
  );

  if (totalPotAmount !== totalChipsCommitted) {
    throw new Error(
      `Pot amount mismatch: pots=${totalPotAmount}, committed=${totalChipsCommitted}`
    );
  }
}

/**
 * Gets the minimum raise amount for the current betting round
 *
 * @param hand - Hand object with currentBet and lastRaiseAmount
 * @param table - Table object with bigBlind
 * @returns Minimum raise amount in gwei
 */
export function getMinimumRaiseAmount(
  hand: { currentBet: bigint | null; lastRaiseAmount: bigint | null },
  table: { bigBlind: bigint }
): bigint {
  // If there's a lastRaiseAmount, use it (minimum raise rule)
  if (hand.lastRaiseAmount !== null && hand.lastRaiseAmount > 0n) {
    return hand.lastRaiseAmount;
  }

  // Otherwise, minimum raise is the big blind
  return table.bigBlind;
}

/**
 * Gets the minimum bet amount (for betting when currentBet is 0)
 *
 * @param table - Table object with bigBlind
 * @returns Minimum bet amount in gwei (big blind)
 */
export function getMinimumBetAmount(table: { bigBlind: bigint }): bigint {
  return table.bigBlind;
}

/**
 * Validates an incremental bet/raise amount
 *
 * @param incrementalAmount - Incremental amount to bet/raise (what player is adding from their balance)
 * @param currentBet - Current highest bet
 * @param chipsCommitted - Player's current chips committed this round
 * @param tableBalanceGwei - Player's available table balance
 * @param minimumRaise - Minimum raise amount
 * @param bigBlind - Big blind amount
 * @returns Object with isValid flag and error message if invalid
 */
export function validateBetAmount(
  incrementalAmount: bigint,
  currentBet: bigint | null,
  chipsCommitted: bigint,
  tableBalanceGwei: bigint,
  minimumRaise: bigint,
  bigBlind: bigint
): { isValid: boolean; error?: string } {
  // Check if incremental amount exceeds available balance
  if (incrementalAmount > tableBalanceGwei) {
    return {
      isValid: false,
      error: `Insufficient balance. Available: ${tableBalanceGwei} gwei, Requested: ${incrementalAmount} gwei`,
    };
  }

  // Calculate total bet amount after this action
  const totalBetAmount = chipsCommitted + incrementalAmount;
  const currentBetAmount = currentBet || 0n;

  // Check if this is an all-in move (player is betting their entire balance)
  const isAllIn = incrementalAmount >= tableBalanceGwei;

  if (currentBetAmount === 0n) {
    // Betting (no current bet)
    if (totalBetAmount < bigBlind) {
      return {
        isValid: false,
        error: `Minimum bet is ${bigBlind} gwei (big blind). Your total bet would be ${totalBetAmount} gwei`,
      };
    }
  } else {
    // Raising or calling (current bet exists)
    const raiseAmount = totalBetAmount - currentBetAmount;

    // If player is going all-in, allow it even if it doesn't meet minimum raise
    // as long as they're matching or exceeding the current bet
    if (!isAllIn && raiseAmount < minimumRaise && totalBetAmount > currentBetAmount) {
      return {
        isValid: false,
        error: `Minimum raise is ${minimumRaise} gwei. You must raise by at least ${minimumRaise} gwei`,
      };
    }

    // If not all-in and total bet is less than current bet, that's invalid (can't bet less)
    if (!isAllIn && totalBetAmount < currentBetAmount) {
      return {
        isValid: false,
        error: `Total bet amount (${totalBetAmount} gwei) must be at least the current bet (${currentBetAmount} gwei). Use CALL to match the current bet.`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Rounds amount to nearest increment
 *
 * @param amount - Amount to round
 * @param increment - Increment size (e.g., big blind)
 * @returns Rounded amount
 */
export function roundToIncrement(amount: bigint, increment: bigint): bigint {
  if (increment === 0n) {
    return amount;
  }
  return (amount / increment) * increment;
}

