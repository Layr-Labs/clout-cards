/**
 * Accounting service
 *
 * Provides functions for verifying solvency by comparing total escrow balances
 * (all player balances in the database) against the actual contract balance on-chain.
 *
 * This is critical for detecting insolvency bugs where the database state diverges
 * from the actual funds held in the smart contract.
 */

import { prisma } from '../db/client';
import { createRpcProvider, getRpcUrl } from '../utils/rpcProvider';
import { getContractAddress } from '../utils/contract';

/** Timeout for RPC calls in milliseconds */
const RPC_TIMEOUT_MS = 15000;

/**
 * Individual player escrow balance
 */
export interface PlayerBalance {
  /** Wallet address (checksummed) */
  address: string;
  /** Balance in gwei */
  balanceGwei: string;
}

/**
 * Solvency check result
 */
export interface SolvencyResult {
  /** Total escrow balance across all players (in gwei) */
  totalEscrowGwei: string;
  /** Contract ETH balance (in gwei) */
  contractBalanceGwei: string;
  /** Whether the contract has sufficient funds to cover all escrow balances */
  isSolvent: boolean;
  /** Shortfall amount in gwei if insolvent, null if solvent */
  shortfallGwei: string | null;
  /** Breakdown of individual player balances */
  breakdown: {
    /** Number of players with escrow balances */
    playerCount: number;
    /** List of individual player balances */
    players: PlayerBalance[];
  };
}

/**
 * Gets the total escrow balance across all players
 *
 * Queries the database for all player escrow balances and returns the sum.
 *
 * @returns Total escrow balance in gwei and breakdown of individual balances
 */
export async function getTotalEscrowBalance(): Promise<{
  totalGwei: bigint;
  players: PlayerBalance[];
}> {
  console.log('[Accounting] Querying escrow balances from database...');
  
  try {
    // Query all player escrow balances
    const balances = await prisma.$queryRaw<Array<{
      wallet_address: string;
      balance_gwei: bigint;
    }>>`
      SELECT wallet_address, balance_gwei
      FROM player_escrow_balances
      WHERE balance_gwei > 0
      ORDER BY balance_gwei DESC
    `;

    // Calculate total
    let totalGwei = 0n;
    const players: PlayerBalance[] = [];

    for (const row of balances) {
      totalGwei += row.balance_gwei;
      players.push({
        address: row.wallet_address,
        balanceGwei: row.balance_gwei.toString(),
      });
    }

    console.log(`[Accounting] Found ${players.length} players with total escrow: ${totalGwei} gwei`);
    return { totalGwei, players };
  } catch (error) {
    console.error('[Accounting] ❌ Failed to query escrow balances:', error);
    throw error;
  }
}

/**
 * Gets the contract's ETH balance with timeout
 *
 * Queries the blockchain for the current ETH balance held by the CloutCards contract.
 * Includes a timeout to prevent hanging indefinitely on slow/unresponsive RPC endpoints.
 *
 * @returns Contract balance in gwei
 * @throws {Error} If contract address is not configured, RPC call fails, or timeout
 */
export async function getContractBalance(): Promise<bigint> {
  console.log('[Accounting] Getting contract balance...');
  
  // Get contract address with logging
  let contractAddress: string;
  try {
    contractAddress = getContractAddress();
    console.log(`[Accounting] Contract address: ${contractAddress}`);
  } catch (error) {
    console.error('[Accounting] ❌ Failed to get contract address:', error);
    throw error;
  }

  // Get RPC URL for logging (don't log full URL in case it contains API keys)
  let rpcUrl: string;
  try {
    rpcUrl = getRpcUrl();
    // Only log hostname, not full URL (may contain API keys)
    const urlObj = new URL(rpcUrl);
    console.log(`[Accounting] RPC endpoint: ${urlObj.hostname}`);
  } catch (error) {
    console.error('[Accounting] ❌ Failed to get RPC URL:', error);
    throw error;
  }

  // Create provider
  const provider = createRpcProvider();
  console.log(`[Accounting] Fetching balance from RPC (timeout: ${RPC_TIMEOUT_MS}ms)...`);

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`RPC request timed out after ${RPC_TIMEOUT_MS}ms. Check RPC_URL configuration.`));
    }, RPC_TIMEOUT_MS);
  });

  try {
    // Race between the actual RPC call and timeout
    const startTime = Date.now();
    const balanceWei = await Promise.race([
      provider.getBalance(contractAddress),
      timeoutPromise
    ]);
    const elapsed = Date.now() - startTime;

    // Convert to gwei (divide by 10^9)
    const balanceGwei = balanceWei / BigInt(10 ** 9);

    console.log(`[Accounting] ✅ Contract balance: ${balanceGwei} gwei (${elapsed}ms)`);
    return balanceGwei;
  } catch (error) {
    console.error('[Accounting] ❌ Failed to fetch contract balance:', error);
    throw error;
  }
}

/**
 * Performs a full solvency check
 *
 * Compares the total escrow balances in the database against the actual
 * contract balance on-chain. Returns detailed breakdown for debugging.
 *
 * @returns Solvency result with totals, status, and breakdown
 * @throws {Error} If contract address is not configured or RPC call fails
 */
export async function checkSolvency(): Promise<SolvencyResult> {
  console.log('[Accounting] ========== Starting solvency check ==========');
  const startTime = Date.now();

  try {
    // Get escrow balances from database
    const { totalGwei: totalEscrowGwei, players } = await getTotalEscrowBalance();

    // Get contract balance from blockchain
    const contractBalanceGwei = await getContractBalance();

    // Check solvency
    const isSolvent = contractBalanceGwei >= totalEscrowGwei;
    const shortfallGwei = isSolvent ? null : (totalEscrowGwei - contractBalanceGwei).toString();

    const elapsed = Date.now() - startTime;
    
    if (isSolvent) {
      console.log(`[Accounting] ✅ SOLVENT - Escrow: ${totalEscrowGwei} gwei, Contract: ${contractBalanceGwei} gwei (${elapsed}ms)`);
    } else {
      console.log(`[Accounting] ⚠️  INSOLVENT - Escrow: ${totalEscrowGwei} gwei, Contract: ${contractBalanceGwei} gwei, Shortfall: ${shortfallGwei} gwei (${elapsed}ms)`);
    }
    console.log('[Accounting] ========== Solvency check complete ==========');

    return {
      totalEscrowGwei: totalEscrowGwei.toString(),
      contractBalanceGwei: contractBalanceGwei.toString(),
      isSolvent,
      shortfallGwei,
      breakdown: {
        playerCount: players.length,
        players,
      },
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Accounting] ❌ Solvency check failed after ${elapsed}ms:`, error);
    console.log('[Accounting] ========== Solvency check failed ==========');
    throw error;
  }
}
