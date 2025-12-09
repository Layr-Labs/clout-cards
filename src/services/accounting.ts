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
import { createRpcProvider } from '../utils/rpcProvider';
import { getContractAddress } from '../utils/contract';

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

  return { totalGwei, players };
}

/**
 * Gets the contract's ETH balance
 *
 * Queries the blockchain for the current ETH balance held by the CloutCards contract.
 *
 * @returns Contract balance in gwei
 * @throws {Error} If contract address is not configured or RPC call fails
 */
export async function getContractBalance(): Promise<bigint> {
  const contractAddress = getContractAddress();
  const provider = createRpcProvider();

  // Get balance in wei
  const balanceWei = await provider.getBalance(contractAddress);

  // Convert to gwei (divide by 10^9)
  const balanceGwei = balanceWei / BigInt(10 ** 9);

  return balanceGwei;
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
  // Get escrow balances from database
  const { totalGwei: totalEscrowGwei, players } = await getTotalEscrowBalance();

  // Get contract balance from blockchain
  const contractBalanceGwei = await getContractBalance();

  // Check solvency
  const isSolvent = contractBalanceGwei >= totalEscrowGwei;
  const shortfallGwei = isSolvent ? null : (totalEscrowGwei - contractBalanceGwei).toString();

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
}

