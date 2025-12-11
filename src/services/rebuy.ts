/**
 * Rebuy service
 *
 * Handles players adding more chips to their table balance from escrow.
 * This allows seated players to rebuy without standing up and sitting back down.
 */

import { prisma } from '../db/client';
import { createEventInTransaction, EventKind } from '../db/events';
import { getEscrowBalanceWithWithdrawal } from './escrowBalance';
import { validateTableExistsAndActive } from '../utils/tableValidation';

/**
 * Input for rebuying at a poker table
 */
export interface RebuyInput {
  tableId: number;
  rebuyAmountGwei: bigint;
}

/**
 * Result of a successful rebuy operation
 */
export interface RebuyResult {
  id: number;
  tableId: number;
  walletAddress: string;
  seatNumber: number;
  tableBalanceGwei: bigint;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  joinedAt: Date;
}

/**
 * Rebuy at a poker table with atomic transaction
 *
 * Atomically:
 * 1. Validates player has an active session at the table
 * 2. Validates player is not participating in an active hand
 * 3. Validates rebuy amount doesn't exceed maximum buy-in limit
 * 4. Checks user doesn't have pending withdrawal
 * 5. Validates escrow balance is sufficient
 * 6. Deducts rebuy amount from escrow balance
 * 7. Updates session's table balance
 * 8. Creates "join_table" event (reused for rebuy notifications)
 *
 * @param walletAddress - Player's wallet address
 * @param input - Rebuy parameters (tableId, rebuyAmountGwei)
 * @returns The updated table seat session
 * @throws {Error} If validation fails or transaction fails
 *
 * Error conditions:
 * - "No active session found" - Player is not seated at this table
 * - "Cannot rebuy during an active hand" - Player is participating in an active hand
 * - "Rebuy amount exceeds maximum" - Would exceed table's maximum buy-in
 * - "pending withdrawal" - Player has a pending withdrawal
 * - "Insufficient escrow balance" - Not enough funds in escrow
 */
export async function rebuy(
  walletAddress: string,
  input: RebuyInput
): Promise<RebuyResult> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Validate table exists and is active
  const table = await validateTableExistsAndActive(input.tableId, prisma);

  // Atomic transaction: validate, check hand, deduct escrow, update session, create event
  return await prisma.$transaction(async (tx) => {
    // 1. Find active session for this player at this table with row-level locking
    // FOR UPDATE prevents race conditions with standUp - if a stand up is in progress,
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
      JOIN poker_tables pt ON pt.poker_table_id = tss.table_id
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

    const activeHand = activeHandsRaw.length > 0 ? { id: activeHandsRaw[0].hand_id } : null;

    // 3. If there's an active hand, check if player is participating
    // Unlike standUp, rebuy is blocked even for folded players
    if (activeHand) {
      const handPlayer = await (tx as any).handPlayer.findFirst({
        where: {
          handId: activeHand.id,
          seatNumber: session.seatNumber,
        },
      });

      // Block rebuy if player is in hand (regardless of status)
      if (handPlayer) {
        throw new Error('Cannot rebuy during an active hand you are participating in');
      }
    }

    // 4. Calculate maximum allowed rebuy amount
    const maxRebuyAmount = table.maximumBuyIn - session.tableBalanceGwei;
    if (input.rebuyAmountGwei > maxRebuyAmount) {
      throw new Error(
        `Rebuy amount ${input.rebuyAmountGwei} gwei exceeds maximum allowed ${maxRebuyAmount} gwei. ` +
        `Current balance: ${session.tableBalanceGwei} gwei, Max buy-in: ${table.maximumBuyIn} gwei`
      );
    }

    // 5. Check for pending withdrawal and escrow balance
    const escrowState = await getEscrowBalanceWithWithdrawal(normalizedAddress);
    if (escrowState.withdrawalPending) {
      throw new Error('Cannot rebuy while a withdrawal is pending. Please wait for the withdrawal to complete or expire.');
    }

    if (escrowState.balanceGwei < input.rebuyAmountGwei) {
      throw new Error(
        `Insufficient escrow balance. Required: ${input.rebuyAmountGwei} gwei, Available: ${escrowState.balanceGwei} gwei`
      );
    }

    // 6. Deduct rebuy amount from escrow balance
    const existingBalances = await tx.$queryRaw<Array<{ wallet_address: string; balance_gwei: bigint }>>`
      SELECT wallet_address, balance_gwei
      FROM player_escrow_balances
      WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
      LIMIT 1
    `;

    if (existingBalances.length === 0) {
      throw new Error(`No escrow balance found for ${normalizedAddress}`);
    }

    const existingAddress = existingBalances[0].wallet_address;
    const currentBalance = existingBalances[0].balance_gwei;
    const newEscrowBalance = currentBalance - input.rebuyAmountGwei;

    await tx.playerEscrowBalance.update({
      where: { walletAddress: existingAddress },
      data: {
        balanceGwei: newEscrowBalance,
      },
    });

    // 7. Update session's table balance
    const newTableBalance = session.tableBalanceGwei + input.rebuyAmountGwei;
    const updatedSession = await tx.tableSeatSession.update({
      where: { id: session.id },
      data: {
        tableBalanceGwei: newTableBalance,
      },
    });

    // 8. Create canonical JSON payload for event
    // Reuse join_table event kind for rebuy - same payload structure
    const payload = {
      kind: 'join_table',
      player: normalizedAddress,
      table: {
        id: session.table.id,
        name: session.table.name,
      },
      seatNumber: session.seatNumber,
      buyInAmountGwei: input.rebuyAmountGwei.toString(),
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
      isRebuy: true, // Flag to distinguish from initial join
    };
    const payloadJson = JSON.stringify(payload);

    // 9. Create "join_table" event
    // Note: tableId is automatically extracted from payload.table.id for SSE filtering
    await createEventInTransaction(tx, EventKind.JOIN_TABLE, payloadJson, normalizedAddress, null);

    return {
      id: updatedSession.id,
      tableId: updatedSession.tableId,
      walletAddress: updatedSession.walletAddress,
      seatNumber: updatedSession.seatNumber,
      tableBalanceGwei: updatedSession.tableBalanceGwei,
      twitterHandle: updatedSession.twitterHandle,
      twitterAvatarUrl: updatedSession.twitterAvatarUrl,
      joinedAt: updatedSession.joinedAt,
    };
  });
}

