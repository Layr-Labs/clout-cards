/**
 * Player escrow balance service
 *
 * Manages player escrow balances stored in the database.
 * Balances are updated when Deposited() events are detected from the CloutCards contract.
 */

import { prisma } from '../db/client';
import { withEvent, EventKind } from '../db/events';

/**
 * Gets the escrow balance for a player wallet address
 *
 * @param walletAddress - Ethereum wallet address
 * @returns Balance in gwei, or 0n if no balance exists
 */
export async function getEscrowBalance(walletAddress: string): Promise<bigint> {
  // Normalize address to lowercase for consistent lookups
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Use case-insensitive query with raw SQL for efficiency
  // This handles both new lowercase entries and legacy mixed-case entries
  const result = await prisma.$queryRaw<Array<{ balance_gwei: bigint }>>`
    SELECT balance_gwei
    FROM player_escrow_balances
    WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
    LIMIT 1
  `;

  const balanceGwei = result[0]?.balance_gwei || 0n;
  return balanceGwei;
}

/**
 * Adds to a player's escrow balance
 *
 * This function is called when a Deposited() event is detected from the contract.
 * It updates the balance and creates an event record in a single transaction.
 *
 * @param walletAddress - Ethereum wallet address
 * @param amountGwei - Amount to add in gwei
 * @param txHash - Transaction hash of the deposit
 * @param blockNumber - Block number of the deposit
 * @param blockTimestamp - Block timestamp of the deposit
 */
export async function addEscrowBalance(
  walletAddress: string,
  amountGwei: bigint,
  txHash: string,
  blockNumber: bigint,
  blockTimestamp: Date
): Promise<void> {
  // Normalize address to lowercase for consistent storage
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Create payload JSON for the event
  const payloadJson = JSON.stringify({
    walletAddress: normalizedAddress,
    amountGwei: amountGwei.toString(),
    txHash,
    blockNumber: blockNumber.toString(),
    blockTimestamp: blockTimestamp.toISOString(),
  });

  console.log(`💾 Updating escrow balance for ${normalizedAddress}: +${amountGwei} gwei`);

  // Use withEvent to ensure both balance update and event creation happen atomically
  try {
    await withEvent(
      EventKind.DEPOSIT,
      payloadJson,
      async (tx) => {
        // First, try to find existing balance with case-insensitive lookup
        const existingBalances = await tx.$queryRaw<Array<{ wallet_address: string; balance_gwei: bigint }>>`
          SELECT wallet_address, balance_gwei
          FROM player_escrow_balances
          WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
          LIMIT 1
        `;

        if (existingBalances.length > 0) {
          // Update existing balance (regardless of casing)
          const existingAddress = existingBalances[0].wallet_address;
          const result = await tx.playerEscrowBalance.update({
            where: { walletAddress: existingAddress },
            data: {
              balanceGwei: {
                increment: amountGwei,
              },
            },
          });
          console.log(`✅ Balance updated in transaction: ${result.balanceGwei.toString()} gwei`);
        } else {
          // Create new balance with normalized (lowercase) address
          const result = await tx.playerEscrowBalance.create({
            data: {
              walletAddress: normalizedAddress,
              balanceGwei: amountGwei,
            },
          });
          console.log(`✅ Balance created in transaction: ${result.balanceGwei.toString()} gwei`);
        }
      },
      normalizedAddress,
      null // No nonce for deposit events
    );
    console.log(`✅ Escrow balance update completed for ${normalizedAddress}`);
  } catch (error) {
    console.error(`❌ Error updating escrow balance for ${normalizedAddress}:`, error);
    throw error;
  }
}

