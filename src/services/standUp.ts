/**
 * Stand up service
 *
 * Handles players leaving poker tables with atomic transactions.
 */

import { prisma } from '../db/client';
import { createEventInTransaction, EventKind } from '../db/events';

/**
 * Input for standing up from a poker table
 */
export interface StandUpInput {
  tableId: number;
}

/**
 * Stands up from a poker table with atomic transaction
 *
 * Atomically:
 * 1. Validates player has an active session at the table
 * 2. Validates player can stand up (no active hand OR player has folded)
 * 3. Gets current table balance
 * 4. Adds balance back to escrow
 * 5. Creates "stand_up" event
 * 6. Marks session as inactive and sets leftAt timestamp
 *
 * @param walletAddress - Player's wallet address
 * @param input - Stand up parameters
 * @returns The updated table seat session
 * @throws {Error} If validation fails or transaction fails
 */
export async function standUp(
  walletAddress: string,
  input: StandUpInput
): Promise<{
  id: number;
  tableId: number;
  walletAddress: string;
  seatNumber: number;
  tableBalanceGwei: bigint;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  joinedAt: Date;
  leftAt: Date;
  isActive: boolean;
}> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Atomic transaction: validate session, move balance, create event, update session
  return await prisma.$transaction(async (tx) => {
    // 1. Find active session for this player at this table
    const session = await tx.tableSeatSession.findFirst({
      where: {
        walletAddress: normalizedAddress,
        tableId: input.tableId,
        isActive: true,
      },
      include: {
        table: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error(`No active session found for player at table ${input.tableId}`);
    }

    // 2. Check if there's an active hand on the table
    const activeHand = await (tx as any).hand.findFirst({
      where: {
        tableId: input.tableId,
        status: {
          not: 'COMPLETED',
        },
      },
    });

    // 3. If there's an active hand, verify player has folded
    if (activeHand) {
      const handPlayer = await (tx as any).handPlayer.findFirst({
        where: {
          handId: activeHand.id,
          seatNumber: session.seatNumber,
        },
      });

      // If player is in the hand but hasn't folded, prevent stand up
      if (handPlayer && handPlayer.status !== 'FOLDED') {
        throw new Error(
          `Cannot stand up: active hand in progress. Player must fold first or wait for hand to complete.`
        );
      }
    }

    // 4. Get current table balance
    const tableBalanceGwei = session.tableBalanceGwei;

    // 5. Add balance back to escrow
    const existingBalances = await tx.$queryRaw<Array<{ wallet_address: string; balance_gwei: bigint }>>`
      SELECT wallet_address, balance_gwei
      FROM player_escrow_balances
      WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
      LIMIT 1
    `;

    if (existingBalances.length === 0) {
      // Create escrow balance if it doesn't exist (shouldn't happen, but handle gracefully)
      await tx.playerEscrowBalance.create({
        data: {
          walletAddress: normalizedAddress,
          balanceGwei: tableBalanceGwei,
        },
      });
    } else {
      const existingAddress = existingBalances[0].wallet_address;
      const currentBalance = existingBalances[0].balance_gwei;
      const newBalance = currentBalance + tableBalanceGwei;

      await tx.playerEscrowBalance.update({
        where: { walletAddress: existingAddress },
        data: {
          balanceGwei: newBalance,
        },
      });
    }

    // 6. Create canonical JSON payload for event
    const payload = {
      kind: 'leave_table',
      player: normalizedAddress,
      table: {
        id: session.table.id,
        name: session.table.name,
      },
      seatNumber: session.seatNumber,
      finalBalanceGwei: tableBalanceGwei.toString(),
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
    };
    const payloadJson = JSON.stringify(payload);

    // 7. Create "leave_table" event
    await createEventInTransaction(tx, EventKind.LEAVE_TABLE, payloadJson, normalizedAddress, null);

    // 8. Update session to inactive
    const updatedSession = await tx.tableSeatSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        leftAt: new Date(),
      },
    });

    return {
      id: updatedSession.id,
      tableId: updatedSession.tableId,
      walletAddress: updatedSession.walletAddress,
      seatNumber: updatedSession.seatNumber,
      tableBalanceGwei: updatedSession.tableBalanceGwei,
      twitterHandle: updatedSession.twitterHandle,
      twitterAvatarUrl: updatedSession.twitterAvatarUrl,
      joinedAt: updatedSession.joinedAt,
      leftAt: updatedSession.leftAt!,
      isActive: updatedSession.isActive,
    };
  });
}

