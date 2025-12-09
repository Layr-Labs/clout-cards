/**
 * Action timeout checker service
 *
 * Periodically checks for expired action timers and auto-folds players.
 * Runs every 1-2 seconds to check for hands where actionTimeoutAt has passed.
 */

import { prisma } from '../db/client';
import { foldAction } from './playerAction';

/**
 * Checks for expired action timers and auto-folds players
 *
 * Queries for active hands where actionTimeoutAt is in the past and
 * currentActionSeat is set. For each expired timer, calls foldAction
 * with reason='timeout' to auto-fold the player.
 *
 * @returns Promise that resolves when check is complete
 */
async function checkExpiredTimers(): Promise<void> {
  try {
    const now = new Date();
    
    // Find all active hands with expired timers
    const expiredHands = await (prisma as any).hand.findMany({
      where: {
        status: {
          not: 'COMPLETED',
        },
        currentActionSeat: {
          not: null,
        },
        actionTimeoutAt: {
          lte: now, // Less than or equal to now (expired)
        },
      },
      include: {
        table: {
          select: {
            id: true,
          },
        },
        players: true, // Get all players to find the acting player
      },
    });

    for (const hand of expiredHands) {
      if (hand.currentActionSeat === null || hand.currentActionSeat === undefined) {
        continue; // Shouldn't happen due to query, but be safe
      }

      // Find the player at the current action seat
      const actingPlayer = hand.players.find((p: any) => p.seatNumber === hand.currentActionSeat);
      if (!actingPlayer) {
        console.error(`[ActionTimeoutChecker] Hand ${hand.id}: No player found at seat ${hand.currentActionSeat}`);
        continue;
      }

      // Check if player is still active (not already folded or all-in)
      if (actingPlayer.status !== 'ACTIVE') {
        // Player already acted or folded, clear the timeout
        await (prisma as any).hand.update({
          where: { id: hand.id },
          data: {
            actionTimeoutAt: null,
          },
        });
        continue;
      }

      console.log(`[ActionTimeoutChecker] Hand ${hand.id}: Auto-folding seat ${hand.currentActionSeat} (timeout expired)`);
      
      try {
        // Auto-fold the player
        await foldAction(prisma, hand.table.id, actingPlayer.walletAddress, 'timeout');
        console.log(`[ActionTimeoutChecker] Hand ${hand.id}: Successfully auto-folded seat ${hand.currentActionSeat}`);
      } catch (error: any) {
        // Log error but continue checking other hands
        console.error(`[ActionTimeoutChecker] Hand ${hand.id}: Failed to auto-fold seat ${hand.currentActionSeat}:`, error);
        
        // If the error is due to a race condition (hand already completed, not player's turn, etc.),
        // clear the timeout to prevent repeated attempts. These are expected when:
        // - Another action (manual or timeout) already settled the hand
        // - The player already acted before the timeout was processed
        // - The hand was completed by another concurrent action
        const isRaceCondition = 
          error.message?.includes('turn') || 
          error.message?.includes('not the player') ||
          error.message?.includes('already completed') ||
          error.message?.includes('No active hand');
          
        if (isRaceCondition) {
          console.log(`[ActionTimeoutChecker] Hand ${hand.id}: Race condition detected, clearing timeout`);
          await (prisma as any).hand.update({
            where: { id: hand.id },
            data: {
              actionTimeoutAt: null,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error('[ActionTimeoutChecker] Error checking expired timers:', error);
  }
}

/**
 * Starts the periodic action timeout checker
 *
 * Runs checkExpiredTimers every 1-2 seconds (configurable).
 * Continues running until the process exits.
 *
 * @param intervalMs - Interval in milliseconds between checks (default: 1500ms = 1.5 seconds)
 */
export function startActionTimeoutChecker(intervalMs: number = 1500): void {
  console.log(`[ActionTimeoutChecker] Starting periodic checker (interval: ${intervalMs}ms)`);
  
  // Run immediately on startup, then periodically
  checkExpiredTimers();
  
  setInterval(() => {
    checkExpiredTimers();
  }, intervalMs);
}

