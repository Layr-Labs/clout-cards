/**
 * Service for retrieving current hand information
 *
 * Provides shared logic for building current hand responses,
 * used by both authenticated (/currentHand) and public (/watchCurrentHand) endpoints.
 */

import { prisma } from '../db/client';
import { NotFoundError } from '../utils/errorHandler';

/**
 * Response type for current hand endpoints
 */
export interface CurrentHandResponse {
  handId: number;
  status: string;
  round: string | null;
  communityCards: Array<{ suit: string; rank: string }>;
  players: Array<{
    seatNumber: number;
    walletAddress: string;
    twitterHandle: string | null;
    twitterAvatarUrl: string | null;
    status: string;
    chipsCommitted: string;
    holeCards: Array<{ suit: string; rank: string }> | null;
  }>;
  pots: Array<{
    potNumber: number;
    amount: string;
    eligibleSeatNumbers: number[];
  }>;
  dealerPosition: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  currentActionSeat: number | null;
  actionTimeoutAt: string | null; // ISO timestamp when current player's turn expires
  currentBet: string | null;
  lastRaiseAmount: string | null;
  lastEventId: number; // Latest event ID for this table (for SSE reconnection)
}

/**
 * Gets the current active hand for a table and builds the response
 *
 * @param tableId - Table ID to get hand for
 * @param walletAddress - Optional wallet address for authorized player check (if includeHoleCards is true)
 * @param includeHoleCards - Whether to include hole cards for authorized player (if active/all-in)
 * @returns Promise that resolves to the current hand response
 * @throws {NotFoundError} If no active hand is found
 */
export async function getCurrentHandResponse(
  tableId: number,
  walletAddress?: string,
  includeHoleCards: boolean = false
): Promise<CurrentHandResponse> {
  // Get current active hand
  const hand = await (prisma as any).hand.findFirst({
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
    orderBy: {
      startedAt: 'desc',
    },
  });

  if (!hand) {
    throw new NotFoundError('No active hand found for this table');
  }

  // Get table seat sessions to get Twitter info
  const seatSessions = await prisma.tableSeatSession.findMany({
    where: {
      tableId,
      isActive: true,
      seatNumber: {
        in: hand.players.map((p: any) => p.seatNumber),
      },
    },
  });

  const seatSessionMap = new Map(
    seatSessions.map((s) => [s.seatNumber, s])
  );

  // Normalize wallet address for comparison (if provided)
  const normalizedAddress = walletAddress?.toLowerCase();

  console.log('[getCurrentHandResponse] processing request', {
    tableId,
    walletAddress,
    normalizedAddress,
    includeHoleCards,
    handId: hand.id,
    handStatus: hand.status,
    playersCount: hand.players.length,
  });

  // Build response
  const communityCards = Array.isArray(hand.communityCards) ? hand.communityCards : [];

  const players = hand.players.map((player: any) => {
    const session = seatSessionMap.get(player.seatNumber);
    const isAuthorizedPlayer = includeHoleCards && normalizedAddress && player.walletAddress.toLowerCase() === normalizedAddress;
    const hasHoleCardsInDB = Array.isArray(player.holeCards) && player.holeCards.length > 0;
    const shouldReturnHoleCards = isAuthorizedPlayer && (player.status === 'ACTIVE' || player.status === 'ALL_IN');
    const holeCardsToReturn = shouldReturnHoleCards && hasHoleCardsInDB
      ? player.holeCards
      : null;

    return {
      seatNumber: player.seatNumber,
      walletAddress: player.walletAddress,
      twitterHandle: session?.twitterHandle || null,
      twitterAvatarUrl: session?.twitterAvatarUrl || null,
      status: player.status,
      chipsCommitted: player.chipsCommitted.toString(),
      // Only return hole cards for authorized player if they're active or all-in (and includeHoleCards is true)
      holeCards: holeCardsToReturn,
    };
  });

  const pots = hand.pots.map((pot: any) => ({
    potNumber: pot.potNumber,
    amount: pot.amount.toString(),
    eligibleSeatNumbers: Array.isArray(pot.eligibleSeatNumbers)
      ? pot.eligibleSeatNumbers
      : [],
  }));

  // Get the latest event ID for this table (for SSE reconnection)
  // This allows clients to connect to SSE starting from the correct event
  const latestEvent = await prisma.event.findFirst({
    where: {
      tableId: tableId,
    },
    orderBy: {
      eventId: 'desc',
    },
    select: {
      eventId: true,
    },
  });

  const lastEventId = latestEvent?.eventId || 0;

  // Defensive check: if currentActionSeat is set but actionTimeoutAt is null,
  // recalculate it (handles edge cases like hands started before timeout feature)
  let actionTimeoutAt: string | null = null;
  if (hand.currentActionSeat !== null) {
    if (hand.actionTimeoutAt) {
      actionTimeoutAt = hand.actionTimeoutAt.toISOString();
    } else {
      // Recalculate timeout if missing (defensive fallback)
      const table = await prisma.pokerTable.findUnique({
        where: { id: tableId },
        select: { actionTimeoutSeconds: true },
      });
      if (table) {
        const { calculateActionTimeout } = await import('./playerAction');
        const timeoutDate = calculateActionTimeout(table);
        actionTimeoutAt = timeoutDate.toISOString();
        
        // Update the hand with the calculated timeout
        await (prisma as any).hand.update({
          where: { id: hand.id },
          data: { actionTimeoutAt: timeoutDate },
        });
      }
    }
  }

  return {
    handId: hand.id,
    status: hand.status,
    round: hand.round,
    communityCards,
    players,
    pots,
    dealerPosition: hand.dealerPosition,
    smallBlindSeat: hand.smallBlindSeat,
    bigBlindSeat: hand.bigBlindSeat,
    currentActionSeat: hand.currentActionSeat,
    actionTimeoutAt,
    currentBet: hand.currentBet?.toString() || null,
    lastRaiseAmount: hand.lastRaiseAmount?.toString() || null,
    lastEventId,
  };
}

