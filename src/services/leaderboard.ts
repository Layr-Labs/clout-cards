/**
 * Leaderboard service
 *
 * Tracks and updates player performance statistics by Twitter handle.
 * Stats are updated incrementally on each hand_end event.
 */

import { prisma } from '../db/client';

/**
 * Updates leaderboard statistics for all players in a completed hand
 *
 * Calculates and updates:
 * - handsPlayed: Incremented for each player who participated
 * - handsWon: Incremented for players who won at least one pot
 * - totalLifetimeBets: Sum of all betting actions (POST_BLIND, CALL, RAISE, ALL_IN)
 * - totalLifetimeWinnings: Sum of pot winnings (split evenly among winners)
 *
 * @param tx - Prisma transaction client
 * @param handId - Hand ID to process
 * @throws {Error} If hand data cannot be retrieved or stats update fails
 */
export async function updateLeaderboardStats(tx: any, handId: number): Promise<void> {
  // Query hand data with all related records
  const hand = await (tx as any).hand.findUnique({
    where: { id: handId },
    include: {
      players: true,
      actions: true,
      pots: true,
      table: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found`);
  }

  // Get wallet addresses and seat numbers from hand players
  const handPlayerWalletAddresses = hand.players.map((p: any) => p.walletAddress.toLowerCase());
  const handPlayerSeatNumbers = hand.players.map((p: any) => p.seatNumber);

  // Query TableSeatSession records matching wallet addresses to get Twitter handles
  // Match by tableId and walletAddress to get the exact sessions that participated in the hand
  // This is more reliable than matching by seatNumber alone, since players can leave and rejoin
  const sessions = await (tx as any).tableSeatSession.findMany({
    where: {
      tableId: hand.table.id,
      walletAddress: {
        in: handPlayerWalletAddresses,
      },
      // Filter to sessions that were active during the hand (or became inactive after the hand started)
      // This ensures we get the correct session even if the player left after the hand completed
      OR: [
        { isActive: true },
        {
          isActive: false,
          leftAt: {
            gte: hand.startedAt, // Session was active when hand started
          },
        },
      ],
    },
    select: {
      walletAddress: true,
      twitterHandle: true,
      seatNumber: true,
      joinedAt: true,
      leftAt: true,
      isActive: true,
    },
    orderBy: [
      { joinedAt: 'desc' }, // Prefer most recent session if multiple exist
    ],
  });

  // Create a map of walletAddress -> twitterHandle
  // Use walletAddress as the key since it's the definitive identifier
  const walletToTwitterMap = new Map<string, string>();
  for (const session of sessions) {
    const walletAddress = session.walletAddress.toLowerCase();
    // Only add if we don't already have a mapping (prefer first match, which is most recent due to ordering)
    if (session.twitterHandle && !walletToTwitterMap.has(walletAddress)) {
      walletToTwitterMap.set(walletAddress, session.twitterHandle);
    }
  }

  // Also create seatNumber -> twitterHandle map for lookup by seat
  const seatToTwitterMap = new Map<number, string>();
  for (const handPlayer of hand.players) {
    const walletAddress = handPlayer.walletAddress.toLowerCase();
    const twitterHandle = walletToTwitterMap.get(walletAddress);
    if (twitterHandle) {
      seatToTwitterMap.set(handPlayer.seatNumber, twitterHandle);
    }
  }

  // Process each player in the hand
  const statsUpdates = new Map<string, {
    handsPlayed: number;
    handsWon: number;
    totalBets: bigint;
    totalWinnings: bigint;
  }>();

  // Get all winner seat numbers from all pots
  const allWinnerSeats = new Set<number>();
  for (const pot of hand.pots) {
    const winnerSeatNumbers = Array.isArray(pot.winnerSeatNumbers) ? pot.winnerSeatNumbers : [];
    winnerSeatNumbers.forEach((seatNum: number) => allWinnerSeats.add(seatNum));
  }

  // Process each hand player
  for (const handPlayer of hand.players) {
    const twitterHandle = seatToTwitterMap.get(handPlayer.seatNumber);

    // Skip players without Twitter handles
    if (!twitterHandle) {
      continue;
    }

    // Initialize stats for this Twitter handle if not already present
    if (!statsUpdates.has(twitterHandle)) {
      statsUpdates.set(twitterHandle, {
        handsPlayed: 0,
        handsWon: 0,
        totalBets: 0n,
        totalWinnings: 0n,
      });
    }

    const stats = statsUpdates.get(twitterHandle)!;

    // Increment hands played
    stats.handsPlayed += 1;

    // Check if this player won any pot
    if (allWinnerSeats.has(handPlayer.seatNumber)) {
      stats.handsWon += 1;
    }

    // Calculate total bets for this player in this hand
    // Sum all HandAction amounts where action is POST_BLIND, CALL, RAISE, or ALL_IN
    const playerActions = hand.actions.filter(
      (action: any) =>
        action.seatNumber === handPlayer.seatNumber &&
        (action.action === 'POST_BLIND' ||
          action.action === 'CALL' ||
          action.action === 'RAISE' ||
          action.action === 'ALL_IN')
    );

    for (const action of playerActions) {
      if (action.amount) {
        stats.totalBets += BigInt(action.amount);
      }
    }
  }

  // Calculate winnings for each winner
  for (const pot of hand.pots) {
    const winnerSeatNumbers = Array.isArray(pot.winnerSeatNumbers) ? pot.winnerSeatNumbers : [];
    if (winnerSeatNumbers.length === 0) {
      continue;
    }

    const potAmount = BigInt(pot.amount);
    const potPerWinner = potAmount / BigInt(winnerSeatNumbers.length);
    const remainder = potAmount % BigInt(winnerSeatNumbers.length);

    // Distribute pot evenly, with remainder going to first winner
    for (let i = 0; i < winnerSeatNumbers.length; i++) {
      const winnerSeatNumber = winnerSeatNumbers[i];
      const twitterHandle = seatToTwitterMap.get(winnerSeatNumber);

      if (!twitterHandle) {
        continue;
      }

      if (!statsUpdates.has(twitterHandle)) {
        statsUpdates.set(twitterHandle, {
          handsPlayed: 0,
          handsWon: 0,
          totalBets: 0n,
          totalWinnings: 0n,
        });
      }

      const stats = statsUpdates.get(twitterHandle)!;
      stats.totalWinnings += potPerWinner + (i === 0 ? remainder : 0n);
    }
  }

  // Update leaderboard stats (upsert for each Twitter handle)
  for (const [twitterHandle, stats] of statsUpdates.entries()) {
    await (tx as any).leaderboardStats.upsert({
      where: { twitterHandle },
      create: {
        twitterHandle,
        handsPlayed: stats.handsPlayed,
        handsWon: stats.handsWon,
        totalLifetimeBets: stats.totalBets,
        totalLifetimeWinnings: stats.totalWinnings,
      },
      update: {
        handsPlayed: { increment: stats.handsPlayed },
        handsWon: { increment: stats.handsWon },
        totalLifetimeBets: { increment: stats.totalBets },
        totalLifetimeWinnings: { increment: stats.totalWinnings },
      },
    });
  }
}

/**
 * Sort options for leaderboard queries
 */
export type LeaderboardSortBy = 'winnings' | 'bets' | 'hands';

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  twitterHandle: string;
  handsPlayed: number;
  handsWon: number;
  totalLifetimeBets: bigint;
  totalLifetimeWinnings: bigint;
}

/**
 * Gets the top players from the leaderboard
 *
 * @param sortBy - Sort criteria: 'winnings', 'bets', or 'hands'
 * @param limit - Maximum number of entries to return (default: 20)
 * @returns Array of leaderboard entries sorted by the specified criteria
 */
export async function getLeaderboard(
  sortBy: LeaderboardSortBy = 'winnings',
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  let orderBy: any;
  switch (sortBy) {
    case 'winnings':
      orderBy = { totalLifetimeWinnings: 'desc' };
      break;
    case 'bets':
      orderBy = { totalLifetimeBets: 'desc' };
      break;
    case 'hands':
      orderBy = { handsPlayed: 'desc' };
      break;
    default:
      orderBy = { totalLifetimeWinnings: 'desc' };
  }

  const stats = await (prisma as any).leaderboardStats.findMany({
    orderBy,
    take: limit,
  });

  return stats.map((stat, index) => ({
    rank: index + 1,
    twitterHandle: stat.twitterHandle,
    handsPlayed: stat.handsPlayed,
    handsWon: stat.handsWon,
    totalLifetimeBets: stat.totalLifetimeBets,
    totalLifetimeWinnings: stat.totalLifetimeWinnings,
  }));
}

