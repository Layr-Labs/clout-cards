/**
 * Join table service
 *
 * Handles players joining poker tables with atomic transactions.
 */

import { prisma } from '../db/client';
import { createEventInTransaction, EventKind } from '../db/events';
import { getEscrowBalanceWithWithdrawal } from './escrowBalance';
import { getTwitterUserInfo } from './twitter';
import { startHand } from './startHand';
import { validateTableExistsAndActive } from '../utils/tableValidation';

/**
 * Input for joining a poker table
 */
export interface JoinTableInput {
  tableId: number;
  seatNumber: number;
  buyInAmountGwei: bigint;
}

/**
 * Joins a poker table with atomic transaction
 *
 * Atomically:
 * 1. Checks user doesn't have pending withdrawal
 * 2. Validates buy-in amount is within table range
 * 3. Validates seat is available
 * 4. Validates user isn't already at another table
 * 5. Deducts buy-in from escrow balance
 * 6. Creates "sit down" event
 * 7. Creates table seat session
 *
 * @param walletAddress - Player's wallet address
 * @param twitterAccessToken - Player's Twitter access token
 * @param input - Join table parameters
 * @returns The created table seat session
 * @throws {Error} If validation fails or transaction fails
 */
export async function joinTable(
  walletAddress: string,
  twitterAccessToken: string,
  input: JoinTableInput
): Promise<{
  id: number;
  tableId: number;
  walletAddress: string;
  seatNumber: number;
  tableBalanceGwei: bigint;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  joinedAt: Date;
}> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Get Twitter user info (will use cache if available)
  const twitterUser = await getTwitterUserInfo(twitterAccessToken);
  const twitterHandle = `@${twitterUser.username}`;
  const twitterAvatarUrl = twitterUser.profile_image_url || null;

  // Validate table exists and is active
  const table = await validateTableExistsAndActive(input.tableId, prisma);

  // Validate seat number
  if (input.seatNumber < 0 || input.seatNumber >= table.maxSeatCount) {
    throw new Error(`Seat number ${input.seatNumber} is invalid. Table has ${table.maxSeatCount} seats (0-${table.maxSeatCount - 1})`);
  }

  // Validate buy-in amount
  if (input.buyInAmountGwei < table.minimumBuyIn) {
    throw new Error(`Buy-in amount ${input.buyInAmountGwei} gwei is below minimum ${table.minimumBuyIn} gwei`);
  }

  if (input.buyInAmountGwei > table.maximumBuyIn) {
    throw new Error(`Buy-in amount ${input.buyInAmountGwei} gwei exceeds maximum ${table.maximumBuyIn} gwei`);
  }

  // Create canonical JSON payload for event
  const payload = {
    kind: 'join_table',
    player: normalizedAddress,
    table: {
      id: table.id,
      name: table.name,
    },
    seatNumber: input.seatNumber,
    buyInAmountGwei: input.buyInAmountGwei.toString(),
    twitterHandle: twitterHandle,
    twitterAvatarUrl: twitterAvatarUrl,
  };
  const payloadJson = JSON.stringify(payload);

  // Atomic transaction: check withdrawal, deduct escrow, create event, create session
  return await prisma.$transaction(async (tx) => {
    // 1. Check for pending withdrawal
    const escrowState = await getEscrowBalanceWithWithdrawal(normalizedAddress);
    if (escrowState.withdrawalPending) {
      throw new Error('Cannot join table while a withdrawal is pending. Please wait for the withdrawal to complete or expire.');
    }

    // 2. Check if user is already seated at THIS table (any seat) - fail immediately
    const existingSessionAtThisTable = await tx.tableSeatSession.findFirst({
      where: {
        walletAddress: normalizedAddress,
        tableId: input.tableId,
        isActive: true,
      },
    });

    if (existingSessionAtThisTable) {
      throw new Error(`Player is already seated at table ${input.tableId}, seat ${existingSessionAtThisTable.seatNumber}`);
    }

    // 3. Check if user is already seated at ANY other table
    const existingActiveSession = await tx.tableSeatSession.findFirst({
      where: {
        walletAddress: normalizedAddress,
        isActive: true,
      },
    });

    if (existingActiveSession) {
      throw new Error(`Player is already seated at table ${existingActiveSession.tableId}, seat ${existingActiveSession.seatNumber}`);
    }

    // 4. Check escrow balance is sufficient (only check after we know they're not already seated)
    if (escrowState.balanceGwei < input.buyInAmountGwei) {
      throw new Error(`Insufficient escrow balance. Required: ${input.buyInAmountGwei} gwei, Available: ${escrowState.balanceGwei} gwei`);
    }

    // 5. Check seat is available (race condition check - in case another player took it)
    const seatOccupied = await tx.tableSeatSession.findFirst({
      where: {
        tableId: input.tableId,
        seatNumber: input.seatNumber,
        isActive: true,
      },
    });

    if (seatOccupied) {
      throw new Error(`Seat ${input.seatNumber} is already occupied`);
    }

    // 6. Deduct buy-in from escrow balance
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
    const newBalance = currentBalance - input.buyInAmountGwei;

    await tx.playerEscrowBalance.update({
      where: { walletAddress: existingAddress },
      data: {
        balanceGwei: newBalance,
      },
    });

    // 7. Create "sit down" event
    await createEventInTransaction(tx, EventKind.JOIN_TABLE, payloadJson, normalizedAddress, null);

    // 8. Create table seat session
    const session = await tx.tableSeatSession.create({
      data: {
        tableId: input.tableId,
        walletAddress: normalizedAddress,
        seatNumber: input.seatNumber,
        tableBalanceGwei: input.buyInAmountGwei,
        twitterHandle: twitterHandle,
        twitterAvatarUrl: twitterAvatarUrl,
        isActive: true,
      },
    });

    // 9. Check if we can start a hand (after session is committed)
    // Note: This check happens after the transaction commits, so we do it outside the transaction
    // to avoid nested transactions. We'll attempt to start a hand if conditions are met.
    
    return {
      id: session.id,
      tableId: session.tableId,
      walletAddress: session.walletAddress,
      seatNumber: session.seatNumber,
      tableBalanceGwei: session.tableBalanceGwei,
      twitterHandle: session.twitterHandle,
      twitterAvatarUrl: session.twitterAvatarUrl,
      joinedAt: session.joinedAt,
    };
  }).then(async (session) => {
    // After transaction commits, check if we can start a hand
    try {
      // Check if there's already an active hand
      const existingHand = await prisma.hand.findFirst({
        where: {
          tableId: input.tableId,
          status: {
            not: 'COMPLETED',
          },
        },
      });

      if (!existingHand) {
        // Try to start a hand (will fail gracefully if conditions not met)
        await startHand(input.tableId).catch((error) => {
          // Silently fail - hand will start when conditions are met
          // This is expected if there aren't 2+ eligible players yet
          console.log(`Could not start hand after join: ${error.message}`);
        });
      }
    } catch (error) {
      // Don't fail the join operation if hand start fails
      console.error('Error attempting to start hand after join:', error);
    }

    return session;
  });
}

