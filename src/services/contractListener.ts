/**
 * Contract event listener service
 *
 * Listens to Deposited() and WithdrawalExecuted() events from the CloutCards contract
 * and updates the player escrow balance in the database.
 * Also provides a reprocess function to catch up on missed events.
 */

import { ethers } from 'ethers';
import { addEscrowBalance, processWithdrawalExecution } from './escrowBalance';
import { createCloutCardsEventsContract, getContractAddress } from '../utils/contract';
import { prisma } from '../db/client';
import { isProduction } from '../config/env';

/**
 * Result of a single event reprocess attempt
 */
export interface ReprocessedEvent {
  type: 'deposit' | 'withdrawal';
  txHash: string;
  blockNumber: number;
  player: string;
  amountGwei: string;
  nonce?: string;
  status: 'processed' | 'skipped' | 'error';
  reason?: string;
}

/**
 * Result of reprocessing events from a block range
 */
export interface ReprocessResult {
  success: boolean;
  fromBlock: number;
  toBlock: number;
  dryRun: boolean;
  depositsProcessed: number;
  depositsSkipped: number;
  withdrawalsProcessed: number;
  withdrawalsSkipped: number;
  errors: number;
  events: ReprocessedEvent[];
}

/**
 * Starts listening to Deposited() and WithdrawalExecuted() events from the CloutCards contract
 *
 * This function:
 * 1. Connects to the Ethereum RPC provider
 * 2. Gets the CloutCards contract instance
 * 3. Listens for Deposited() and WithdrawalExecuted() events
 * 4. Updates the player escrow balance when events are detected
 *
 * @param contractAddress - Address of the CloutCards proxy contract
 * @param rpcUrl - Ethereum RPC URL (defaults to localhost:8545 for Anvil)
 *
 * @throws {Error} If contract address is invalid or RPC connection fails
 */
export function startContractListener(contractAddress: string, rpcUrl?: string): void {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  const contract = createCloutCardsEventsContract(contractAddress, rpcUrl);
  const provider = contract.runner as ethers.JsonRpcProvider;
  const providerUrl = (provider as any).connection?.url || 'unknown';

  console.log(`📡 Listening to Deposited() and WithdrawalExecuted() events from CloutCards contract: ${contractAddress}`);
  console.log(`   RPC URL: ${providerUrl}`);

  // Listen for Deposited events
  // The handler receives a ContractEventPayload, which has log property containing EventLog
  contract.on('Deposited', async (player: string, depositor: string, amount: bigint, eventPayload: any) => {
    try {
      // Extract event metadata from the EventLog object nested in the payload
      // In ethers.js v6, contract.on() passes ContractEventPayload which has a log property
      const eventLog = eventPayload.log || eventPayload;
      const transactionHash = eventLog.transactionHash;
      const blockNumber = eventLog.blockNumber;

      if (!transactionHash || blockNumber === undefined) {
        console.error('❌ Event missing transaction hash or block number');
        console.error('   eventPayload.log:', eventPayload.log);
        console.error('   eventPayload keys:', Object.keys(eventPayload));
        return;
      }

      console.log(`💰 Deposited event detected:`);
      console.log(`   Player: ${player}`);
      console.log(`   Depositor: ${depositor}`);
      console.log(`   Amount: ${ethers.formatEther(amount)} ETH`);
      console.log(`   Transaction: ${transactionHash}`);
      console.log(`   Block: ${blockNumber}`);

      // Get block timestamp
      const block = await provider.getBlock(blockNumber);
      const blockTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

      // Convert amount from wei to gwei
      const amountGwei = amount / BigInt(10 ** 9);

      // Update escrow balance (this also creates an event record)
      await addEscrowBalance(
        player,
        amountGwei,
        transactionHash,
        BigInt(blockNumber),
        blockTimestamp
      );

      console.log(`✅ Escrow balance updated for ${player}`);
    } catch (error) {
      console.error('❌ Error processing Deposited event:', error);
      // Don't throw - we want to continue listening even if one event fails
    }
  });

  // Listen for WithdrawalExecuted events
  contract.on('WithdrawalExecuted', async (player: string, to: string, amount: bigint, nonce: bigint, eventPayload: any) => {
    try {
      // Extract event metadata from the EventLog object nested in the payload
      const eventLog = eventPayload.log || eventPayload;
      const transactionHash = eventLog.transactionHash;
      const blockNumber = eventLog.blockNumber;

      if (!transactionHash || blockNumber === undefined) {
        console.error('❌ WithdrawalExecuted event missing transaction hash or block number');
        console.error('   eventPayload.log:', eventPayload.log);
        console.error('   eventPayload keys:', Object.keys(eventPayload));
        return;
      }

      console.log(`💸 WithdrawalExecuted event detected:`);
      console.log(`   Player: ${player}`);
      console.log(`   To: ${to}`);
      console.log(`   Amount: ${ethers.formatEther(amount)} ETH`);
      console.log(`   Nonce: ${nonce}`);
      console.log(`   Transaction: ${transactionHash}`);
      console.log(`   Block: ${blockNumber}`);

      // Get block timestamp
      const block = await provider.getBlock(blockNumber);
      const blockTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

      // Convert amount from wei to gwei
      const amountGwei = amount / BigInt(10 ** 9);

      // Process withdrawal execution (reduces balance and clears withdrawal state)
      await processWithdrawalExecution(
        player,
        amountGwei,
        nonce,
        transactionHash,
        BigInt(blockNumber),
        blockTimestamp
      );

      console.log(`✅ Withdrawal execution processed for ${player}`);
    } catch (error) {
      console.error('❌ Error processing WithdrawalExecuted event:', error);
      // Don't throw - we want to continue listening even if one event fails
    }
  });

  // Handle provider errors (not contract events)
  provider.on('error', (error: Error) => {
    console.error('❌ Provider error:', error);
  });

  // Log when listener is ready
  provider.once('block', () => {
    console.log('✅ Contract event listener started and ready');
  });
}

/**
 * Checks if a deposit event with the given transaction hash has already been processed
 *
 * @param txHash - Transaction hash to check
 * @returns True if the deposit was already processed, false otherwise
 */
async function isDepositAlreadyProcessed(txHash: string): Promise<boolean> {
  // Check if a deposit event with this txHash exists in the events table
  // The txHash is stored in the payloadJson field
  const existingEvent = await prisma.event.findFirst({
    where: {
      kind: 'deposit',
      payloadJson: {
        contains: txHash,
      },
    },
    select: { eventId: true },
  });

  return existingEvent !== null;
}

/**
 * Checks if a withdrawal event with the given transaction hash has already been processed
 *
 * @param txHash - Transaction hash to check
 * @returns True if the withdrawal was already processed, false otherwise
 */
async function isWithdrawalAlreadyProcessed(txHash: string): Promise<boolean> {
  // Check if a withdrawal_executed event with this txHash exists in the events table
  const existingEvent = await prisma.event.findFirst({
    where: {
      kind: 'withdrawal_executed',
      payloadJson: {
        contains: txHash,
      },
    },
    select: { eventId: true },
  });

  return existingEvent !== null;
}

/**
 * Reprocesses contract events from a specified block range
 *
 * This function queries the blockchain for Deposited and WithdrawalExecuted events
 * within the specified block range and processes any that were missed (not in our database).
 *
 * @param fromBlock - Starting block number (inclusive)
 * @param toBlock - Ending block number (inclusive), defaults to 'latest'
 * @param dryRun - If true, only report what would be processed without making changes
 * @returns Summary of reprocessed events
 *
 * @throws {Error} If contract address is not configured or RPC connection fails
 */
export async function reprocessEventsFromBlock(
  fromBlock: number,
  toBlock?: number,
  dryRun: boolean = false
): Promise<ReprocessResult> {
  const contractAddress = getContractAddress();
  const isProd = isProduction();
  const rpcUrl = isProd ? process.env.RPC_URL : undefined;

  const contract = createCloutCardsEventsContract(contractAddress, rpcUrl);
  const provider = contract.runner as ethers.JsonRpcProvider;

  // Get actual toBlock if not specified
  const actualToBlock = toBlock ?? (await provider.getBlockNumber());

  console.log(`🔄 Reprocessing events from block ${fromBlock} to ${actualToBlock}${dryRun ? ' (DRY RUN)' : ''}`);

  const result: ReprocessResult = {
    success: true,
    fromBlock,
    toBlock: actualToBlock,
    dryRun,
    depositsProcessed: 0,
    depositsSkipped: 0,
    withdrawalsProcessed: 0,
    withdrawalsSkipped: 0,
    errors: 0,
    events: [],
  };

  try {
    // Query Deposited events
    console.log('📥 Querying Deposited events...');
    const depositFilter = contract.filters.Deposited();
    const depositEvents = await contract.queryFilter(depositFilter, fromBlock, actualToBlock);
    console.log(`   Found ${depositEvents.length} Deposited events`);

    // Process each deposit event
    for (const event of depositEvents) {
      const eventLog = event as ethers.EventLog;
      const txHash = eventLog.transactionHash;
      const blockNumber = eventLog.blockNumber;

      // Decode event args
      const args = eventLog.args as unknown as [string, string, bigint];
      const [player, , amount] = args;
      const amountGwei = amount / BigInt(10 ** 9);

      const reprocessedEvent: ReprocessedEvent = {
        type: 'deposit',
        txHash,
        blockNumber,
        player,
        amountGwei: amountGwei.toString(),
        status: 'processed',
      };

      // Check if already processed
      const alreadyProcessed = await isDepositAlreadyProcessed(txHash);
      if (alreadyProcessed) {
        reprocessedEvent.status = 'skipped';
        reprocessedEvent.reason = 'Already processed';
        result.depositsSkipped++;
        result.events.push(reprocessedEvent);
        console.log(`   ⏭️  Deposit ${txHash.slice(0, 10)}... already processed, skipping`);
        continue;
      }

      // Process the deposit if not dry run
      if (!dryRun) {
        try {
          const block = await provider.getBlock(blockNumber);
          const blockTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

          await addEscrowBalance(
            player,
            amountGwei,
            txHash,
            BigInt(blockNumber),
            blockTimestamp
          );

          reprocessedEvent.status = 'processed';
          result.depositsProcessed++;
          console.log(`   ✅ Deposit ${txHash.slice(0, 10)}... processed: ${ethers.formatEther(amount)} ETH to ${player}`);
        } catch (error) {
          reprocessedEvent.status = 'error';
          reprocessedEvent.reason = error instanceof Error ? error.message : 'Unknown error';
          result.errors++;
          console.error(`   ❌ Error processing deposit ${txHash}:`, error);
        }
      } else {
        reprocessedEvent.status = 'processed';
        reprocessedEvent.reason = 'Would be processed (dry run)';
        result.depositsProcessed++;
        console.log(`   📋 Deposit ${txHash.slice(0, 10)}... would be processed: ${ethers.formatEther(amount)} ETH to ${player}`);
      }

      result.events.push(reprocessedEvent);
    }

    // Query WithdrawalExecuted events
    console.log('📤 Querying WithdrawalExecuted events...');
    const withdrawalFilter = contract.filters.WithdrawalExecuted();
    const withdrawalEvents = await contract.queryFilter(withdrawalFilter, fromBlock, actualToBlock);
    console.log(`   Found ${withdrawalEvents.length} WithdrawalExecuted events`);

    // Process each withdrawal event
    for (const event of withdrawalEvents) {
      const eventLog = event as ethers.EventLog;
      const txHash = eventLog.transactionHash;
      const blockNumber = eventLog.blockNumber;

      // Decode event args
      const withdrawalArgs = eventLog.args as unknown as [string, string, bigint, bigint];
      const [player, , amount, nonce] = withdrawalArgs;
      const amountGwei = amount / BigInt(10 ** 9);

      const reprocessedEvent: ReprocessedEvent = {
        type: 'withdrawal',
        txHash,
        blockNumber,
        player,
        amountGwei: amountGwei.toString(),
        nonce: nonce.toString(),
        status: 'processed',
      };

      // Check if already processed
      const alreadyProcessed = await isWithdrawalAlreadyProcessed(txHash);
      if (alreadyProcessed) {
        reprocessedEvent.status = 'skipped';
        reprocessedEvent.reason = 'Already processed';
        result.withdrawalsSkipped++;
        result.events.push(reprocessedEvent);
        console.log(`   ⏭️  Withdrawal ${txHash.slice(0, 10)}... already processed, skipping`);
        continue;
      }

      // Process the withdrawal if not dry run
      if (!dryRun) {
        try {
          const block = await provider.getBlock(blockNumber);
          const blockTimestamp = block ? new Date(block.timestamp * 1000) : new Date();

          await processWithdrawalExecution(
            player,
            amountGwei,
            nonce,
            txHash,
            BigInt(blockNumber),
            blockTimestamp
          );

          reprocessedEvent.status = 'processed';
          result.withdrawalsProcessed++;
          console.log(`   ✅ Withdrawal ${txHash.slice(0, 10)}... processed: ${ethers.formatEther(amount)} ETH from ${player}`);
        } catch (error) {
          reprocessedEvent.status = 'error';
          reprocessedEvent.reason = error instanceof Error ? error.message : 'Unknown error';
          result.errors++;
          console.error(`   ❌ Error processing withdrawal ${txHash}:`, error);
        }
      } else {
        reprocessedEvent.status = 'processed';
        reprocessedEvent.reason = 'Would be processed (dry run)';
        result.withdrawalsProcessed++;
        console.log(`   📋 Withdrawal ${txHash.slice(0, 10)}... would be processed: ${ethers.formatEther(amount)} ETH from ${player}`);
      }

      result.events.push(reprocessedEvent);
    }

    console.log(`✅ Reprocess complete:`);
    console.log(`   Deposits: ${result.depositsProcessed} processed, ${result.depositsSkipped} skipped`);
    console.log(`   Withdrawals: ${result.withdrawalsProcessed} processed, ${result.withdrawalsSkipped} skipped`);
    if (result.errors > 0) {
      console.log(`   Errors: ${result.errors}`);
    }

  } catch (error) {
    console.error('❌ Error reprocessing events:', error);
    result.success = false;
    throw error;
  }

  return result;
}

