/**
 * Player escrow balance service
 *
 * Manages player escrow balances stored in the database.
 * Balances are updated when Deposited() events are detected from the CloutCards contract.
 * Also manages withdrawal state to prevent race conditions.
 */

import { prisma } from '../db/client';
import { withEvent, EventKind } from '../db/events';

/**
 * Escrow balance with withdrawal state
 */
export interface EscrowBalanceWithWithdrawal {
  balanceGwei: bigint;
  nextWithdrawalNonce: bigint | null;
  withdrawalSignatureExpiry: Date | null;
  withdrawalPending: boolean;
}

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
 * Gets the full escrow balance with withdrawal state for a player wallet address
 *
 * @param walletAddress - Ethereum wallet address
 * @returns Escrow balance with withdrawal state, or default values if no balance exists
 */
export async function getEscrowBalanceWithWithdrawal(
  walletAddress: string
): Promise<EscrowBalanceWithWithdrawal> {
  // Normalize address to lowercase for consistent lookups
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Use case-insensitive query with raw SQL for efficiency
  const result = await prisma.$queryRaw<Array<{
    balance_gwei: bigint;
    next_withdrawal_nonce: bigint | null;
    withdrawal_signature_expiry: Date | null;
  }>>`
    SELECT balance_gwei, next_withdrawal_nonce, withdrawal_signature_expiry
    FROM player_escrow_balances
    WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
    LIMIT 1
  `;

  const row = result[0];
  if (!row) {
    return {
      balanceGwei: 0n,
      nextWithdrawalNonce: null,
      withdrawalSignatureExpiry: null,
      withdrawalPending: false,
    };
  }

  // Check if withdrawal is pending (expiry exists and is in the future)
  const now = new Date();
  const withdrawalPending =
    row.withdrawal_signature_expiry !== null &&
    row.withdrawal_signature_expiry > now;

  return {
    balanceGwei: row.balance_gwei,
    nextWithdrawalNonce: row.next_withdrawal_nonce,
    withdrawalSignatureExpiry: row.withdrawal_signature_expiry,
    withdrawalPending,
  };
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

/**
 * Counts the number of executed withdrawals for a player
 *
 * Used to verify sync with contract nonce before signing new withdrawals.
 * The contract's nonce equals the total number of successful withdrawals,
 * so if our count doesn't match the contract's nonce, we've missed events.
 *
 * @param walletAddress - Ethereum wallet address
 * @returns Number of withdrawal_executed events for this player
 */
export async function countExecutedWithdrawals(walletAddress: string): Promise<number> {
  const normalizedAddress = walletAddress.toLowerCase();
  return prisma.event.count({
    where: {
      player: normalizedAddress,
      kind: 'withdrawal_executed',
    },
  });
}

/**
 * Processes a withdrawal execution event
 *
 * This function is called when a WithdrawalExecuted() event is detected from the contract.
 * It reduces the escrow balance and clears the withdrawal nonce/expiry in a single transaction.
 *
 * @param walletAddress - Ethereum wallet address
 * @param amountGwei - Amount withdrawn in gwei
 * @param nonce - Withdrawal nonce that was used
 * @param txHash - Transaction hash of the withdrawal
 * @param blockNumber - Block number of the withdrawal
 * @param blockTimestamp - Block timestamp of the withdrawal
 */
export async function processWithdrawalExecution(
  walletAddress: string,
  amountGwei: bigint,
  nonce: bigint,
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
    nonce: nonce.toString(),
    txHash,
    blockNumber: blockNumber.toString(),
    blockTimestamp: blockTimestamp.toISOString(),
  });

  console.log(`💸 Processing withdrawal execution for ${normalizedAddress}: -${amountGwei} gwei (nonce: ${nonce})`);

  // Use withEvent to ensure both balance update and event creation happen atomically
  try {
    await withEvent(
      EventKind.WITHDRAWAL_EXECUTED,
      payloadJson,
      async (tx) => {
        // Find existing balance with case-insensitive lookup, including withdrawal state
        const existingBalances = await tx.$queryRaw<Array<{
          wallet_address: string;
          balance_gwei: bigint;
          next_withdrawal_nonce: bigint | null;
          withdrawal_signature_expiry: Date | null;
        }>>`
          SELECT wallet_address, balance_gwei, next_withdrawal_nonce, withdrawal_signature_expiry
          FROM player_escrow_balances
          WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
          LIMIT 1
        `;

        if (existingBalances.length === 0) {
          throw new Error(`No escrow balance found for ${normalizedAddress}`);
        }

        const existingAddress = existingBalances[0].wallet_address;
        const currentBalance = existingBalances[0].balance_gwei;
        const storedNonce = existingBalances[0].next_withdrawal_nonce;
        const storedExpiry = existingBalances[0].withdrawal_signature_expiry;

        // Validate nonce matches stored nonce (invariant check)
        // If mismatch occurs, log critical warning but process anyway - contract is source of truth
        if (storedNonce !== null && storedNonce !== nonce) {
          console.error(`⚠️  CRITICAL: Nonce mismatch detected for ${normalizedAddress}`);
          console.error(`   Stored nonce: ${storedNonce}, Event nonce: ${nonce}`);
          console.error(`   Transaction hash: ${txHash}`);
          console.error(`   Block number: ${blockNumber}`);
          console.error(`   Amount: ${amountGwei} gwei`);
          console.error(`   Stored expiry: ${storedExpiry?.toISOString() || 'null'}`);
          console.error(`   Block timestamp: ${blockTimestamp.toISOString()}`);
          console.error(`   This may indicate:`);
          console.error(`     - A blockchain reorg occurred`);
          console.error(`     - A WithdrawalExecuted event was missed`);
          console.error(`     - Contract state is out of sync with database`);
          console.error(`     - Manual withdrawal execution bypassed our API`);
          console.error(`   Processing withdrawal anyway - contract is source of truth`);
          console.error(`   Database will be updated to match contract state`);
        }

        // Ensure we don't withdraw more than available (saturating subtraction)
        const newBalance = currentBalance >= amountGwei ? currentBalance - amountGwei : 0n;

        // Update balance and clear withdrawal state
        await tx.playerEscrowBalance.update({
          where: { walletAddress: existingAddress },
          data: {
            balanceGwei: newBalance,
            nextWithdrawalNonce: null,
            withdrawalSignatureExpiry: null,
          },
        });

        console.log(`✅ Withdrawal processed. New balance: ${newBalance.toString()} gwei`);
      },
      normalizedAddress,
      nonce
    );
    console.log(`✅ Withdrawal execution completed for ${normalizedAddress}`);
  } catch (error) {
    console.error(`❌ Error processing withdrawal execution for ${normalizedAddress}:`, error);
    throw error;
  }
}

