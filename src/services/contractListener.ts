/**
 * Contract event listener service
 *
 * Listens to Deposited() and WithdrawalExecuted() events from the CloutCards contract
 * and updates the player escrow balance in the database.
 */

import { ethers } from 'ethers';
import { addEscrowBalance, processWithdrawalExecution } from './escrowBalance';
import { createCloutCardsEventsContract } from '../utils/contract';

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

