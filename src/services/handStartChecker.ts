/**
 * Hand start checker service
 *
 * Periodically checks for tables that are ready to start a new hand after the configured delay.
 * Runs every 1-2 seconds to check for tables where enough time has passed since the last hand ended.
 */

import { prisma } from '../db/client';
import { startNewHandIfPossible } from './playerAction';

/**
 * Calculates the hand start delay in milliseconds based on table configuration
 *
 * @param table - Table object with handStartDelaySeconds
 * @returns Delay in milliseconds (defaults to 30 seconds if not configured)
 */
function calculateHandStartDelay(table: { handStartDelaySeconds: number | null }): number {
  const delaySeconds = (table.handStartDelaySeconds && table.handStartDelaySeconds > 0) 
    ? table.handStartDelaySeconds 
    : 30; // Default 30 seconds
  return delaySeconds * 1000;
}

/**
 * Checks for tables ready to start a new hand
 *
 * Queries for active tables with no active hand where enough time has passed
 * since the last hand ended. Uses startNewHandIfPossible to handle all the
 * validation logic (player count, balances, etc.).
 *
 * @returns Promise that resolves when check is complete
 */
async function checkHandStarts(): Promise<void> {
  try {
    const now = new Date();
    
    // Find all active tables
    const activeTables = await prisma.pokerTable.findMany({
      where: {
        isActive: true,
      },
      include: {
        hands: {
          where: {
            status: {
              not: 'COMPLETED',
            },
          },
          take: 1, // Just check if any active hand exists
        },
      },
    });

    for (const table of activeTables) {
      // Skip if there's already an active hand
      if (table.hands.length > 0) {
        continue;
      }

      // Find the most recent completed hand to get completion time
      const lastCompletedHand = await (prisma as any).hand.findFirst({
        where: {
          tableId: table.id,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: {
          completedAt: true,
        },
      });

      // If no completed hand exists, this is the first hand - start immediately
      if (!lastCompletedHand || !lastCompletedHand.completedAt) {
        try {
          const result = await startNewHandIfPossible(table.id);
          if (result.started) {
            console.log(`[HandStartChecker] Table ${table.id}: Started first hand`);
          }
          // Don't log anything if hand wasn't started - avoid spam
        } catch (error: any) {
          console.error(`[HandStartChecker] Table ${table.id}: Failed to start hand:`, error);
        }
        continue;
      }

      // Calculate if enough time has passed
      const lastCompletedAt = new Date(lastCompletedHand.completedAt);
      const delayMs = calculateHandStartDelay(table);
      const timeSinceLastHand = now.getTime() - lastCompletedAt.getTime();

      if (timeSinceLastHand >= delayMs) {
        try {
          const result = await startNewHandIfPossible(table.id);
          if (result.started) {
            console.log(`[HandStartChecker] Table ${table.id}: Successfully started new hand (after ${Math.floor(timeSinceLastHand / 1000)}s delay)`);
          }
          // Don't log "attempting" or failures for not_enough_players - avoid spam
        } catch (error: any) {
          console.error(`[HandStartChecker] Table ${table.id}: Failed to start hand:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[HandStartChecker] Error checking hand starts:', error);
  }
}

/**
 * Starts the periodic hand start checker
 *
 * Runs checkHandStarts every 1-2 seconds (configurable).
 * Continues running until the process exits.
 *
 * @param intervalMs - Interval in milliseconds between checks (default: 1500ms = 1.5 seconds)
 */
export function startHandStartChecker(intervalMs: number = 1500): void {
  console.log(`[HandStartChecker] Starting periodic checker (interval: ${intervalMs}ms)`);
  
  // Run immediately on startup, then periodically
  checkHandStarts();
  
  setInterval(() => {
    checkHandStarts();
  }, intervalMs);
}

