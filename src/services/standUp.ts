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
    // 1. Find active session for this player at this table with row-level locking
    // FOR UPDATE prevents race conditions with startHand - if a hand is being created,
    // we'll wait for that transaction to complete before proceeding
    const sessionsRaw = await tx.$queryRaw<Array<{
      table_seat_session_id: number;
      table_id: number;
      wallet_address: string;
      seat_number: number;
      table_balance_gwei: bigint;
      twitter_handle: string | null;
      twitter_avatar_url: string | null;
      joined_at: Date;
      left_at: Date | null;
      is_active: boolean;
      table_name: string;
    }>>`
      SELECT tss.*, pt.name as table_name
      FROM table_seat_sessions tss
      JOIN poker_tables pt ON pt.id = tss.table_id
      WHERE LOWER(tss.wallet_address) = LOWER(${normalizedAddress})
        AND tss.table_id = ${input.tableId}
        AND tss.is_active = true
      LIMIT 1
      FOR UPDATE OF tss
    `;

    if (sessionsRaw.length === 0) {
      throw new Error(`No active session found for player at table ${input.tableId}`);
    }

    const sessionRow = sessionsRaw[0];
    const session = {
      id: sessionRow.table_seat_session_id,
      tableId: sessionRow.table_id,
      walletAddress: sessionRow.wallet_address,
      seatNumber: sessionRow.seat_number,
      tableBalanceGwei: sessionRow.table_balance_gwei,
      twitterHandle: sessionRow.twitter_handle,
      twitterAvatarUrl: sessionRow.twitter_avatar_url,
      joinedAt: sessionRow.joined_at,
      leftAt: sessionRow.left_at,
      isActive: sessionRow.is_active,
      table: {
        id: sessionRow.table_id,
        name: sessionRow.table_name,
      },
    };

    // 2. Check if there's an active hand on the table with row-level locking
    // FOR UPDATE ensures that if startHand is creating a hand right now, we wait
    // for it to complete before checking if we're in that hand
    const activeHandsRaw = await tx.$queryRaw<Array<{
      hand_id: number;
      status: string;
    }>>`
      SELECT hand_id, status
      FROM hands
      WHERE table_id = ${input.tableId} AND status != 'COMPLETED'
      ORDER BY hand_id DESC
      LIMIT 1
      FOR UPDATE
    `;

    const activeHand = activeHandsRaw.length > 0 ? { id: activeHandsRaw[0].hand_id, status: activeHandsRaw[0].status } : null;

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

    // 4. Revalidate session is still active (defensive check after all locks acquired)
    // This catches any edge cases where the session state might have changed
    const revalidatedSession = await tx.tableSeatSession.findUnique({
      where: { id: session.id },
      select: { isActive: true },
    });

    if (!revalidatedSession || !revalidatedSession.isActive) {
      throw new Error(`Session is no longer active. Stand up may have already been processed.`);
    }

    // 5. Get current table balance
    const tableBalanceGwei = session.tableBalanceGwei;

    // 6. Add balance back to escrow
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

    // 7. Create canonical JSON payload for event
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

    // 8. Create "leave_table" event
    await createEventInTransaction(tx, EventKind.LEAVE_TABLE, payloadJson, normalizedAddress, null);

    // 9. Update session to inactive
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

