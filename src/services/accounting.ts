/**
 * Accounting service
 *
 * Provides functions for verifying solvency by comparing total player liabilities
 * (escrow balances + table balances) against the actual contract balance on-chain.
 *
 * This is critical for detecting insolvency bugs where the database state diverges
 * from the actual funds held in the smart contract.
 *
 * Total Liabilities = Escrow Balances + Table Balances
 * - Escrow balances: Funds held in player_escrow_balances (not at any table)
 * - Table balances: Funds held in table_seat_sessions (sitting at tables)
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
  /** Wallet address */
  address: string;
  /** Balance in gwei */
  balanceGwei: string;
}

/**
 * Player balance at a specific table
 */
export interface TablePlayerBalance {
  /** Wallet address */
  address: string;
  /** Seat number at the table */
  seatNumber: number;
  /** Balance in gwei */
  balanceGwei: string;
}

/**
 * Table balance breakdown
 */
export interface TableBalance {
  /** Table ID */
  tableId: number;
  /** Table name */
  tableName: string;
  /** Players sitting at this table */
  players: TablePlayerBalance[];
  /** Total balance at this table in gwei */
  totalGwei: string;
}

/**
 * Solvency check result
 */
export interface SolvencyResult {
  /** Total escrow balance across all players (in gwei) - funds not at tables */
  totalEscrowGwei: string;
  /** Total table balance across all active sessions (in gwei) - funds at tables */
  totalTableBalanceGwei: string;
  /** Total liabilities = escrow + table balances (what contract must cover) */
  totalLiabilitiesGwei: string;
  /** Contract ETH balance (in gwei) */
  contractBalanceGwei: string;
  /** Whether the contract has sufficient funds to cover all liabilities */
  isSolvent: boolean;
  /** Shortfall amount in gwei if insolvent, null if solvent */
  shortfallGwei: string | null;
  /** Breakdown of escrow balances */
  escrowBreakdown: {
    /** Number of players with escrow balances */
    playerCount: number;
    /** List of individual escrow balances */
    players: PlayerBalance[];
  };
  /** Breakdown of table balances */
  tableBreakdown: {
    /** Number of tables with active sessions */
    tableCount: number;
    /** List of table balances */
    tables: TableBalance[];
  };
}

/**
 * Gets the total escrow balance across all players
 *
 * Queries the database for all player escrow balances and returns the sum.
 * These are funds held in escrow but NOT currently at any table.
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
 * Gets the total table balance across all active table sessions
 *
 * Queries the database for all active table seat sessions and returns the sum
 * of all table balances. These are funds currently at tables (not in escrow).
 *
 * @returns Total table balance in gwei and breakdown by table
 */
export async function getTotalTableBalance(): Promise<{
  totalGwei: bigint;
  tables: TableBalance[];
}> {
  console.log('[Accounting] Querying table balances from database...');
  
  try {
    // Query all active table sessions with table info
    const sessions = await prisma.$queryRaw<Array<{
      table_id: number;
      table_name: string;
      wallet_address: string;
      seat_number: number;
      table_balance_gwei: bigint;
    }>>`
      SELECT 
        tss.table_id,
        pt.name as table_name,
        tss.wallet_address,
        tss.seat_number,
        tss.table_balance_gwei
      FROM table_seat_sessions tss
      JOIN poker_tables pt ON pt.poker_table_id = tss.table_id
      WHERE tss.is_active = true AND tss.table_balance_gwei > 0
      ORDER BY tss.table_id, tss.seat_number
    `;

    // Group by table and calculate totals
    const tableMap = new Map<number, {
      tableId: number;
      tableName: string;
      players: TablePlayerBalance[];
      totalGwei: bigint;
    }>();

    let totalGwei = 0n;

    for (const session of sessions) {
      totalGwei += session.table_balance_gwei;

      let tableData = tableMap.get(session.table_id);
      if (!tableData) {
        tableData = {
          tableId: session.table_id,
          tableName: session.table_name,
          players: [],
          totalGwei: 0n,
        };
        tableMap.set(session.table_id, tableData);
      }

      tableData.players.push({
        address: session.wallet_address,
        seatNumber: session.seat_number,
        balanceGwei: session.table_balance_gwei.toString(),
      });
      tableData.totalGwei += session.table_balance_gwei;
    }

    // Convert to array format
    const tables: TableBalance[] = Array.from(tableMap.values()).map(t => ({
      tableId: t.tableId,
      tableName: t.tableName,
      players: t.players,
      totalGwei: t.totalGwei.toString(),
    }));

    console.log(`[Accounting] Found ${tables.length} tables with ${sessions.length} players, total table balance: ${totalGwei} gwei`);
    return { totalGwei, tables };
  } catch (error) {
    console.error('[Accounting] ❌ Failed to query table balances:', error);
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
 * Compares the total player liabilities (escrow + table balances) against the actual
 * contract balance on-chain. Returns detailed breakdown for debugging.
 *
 * Total Liabilities = Escrow Balances + Table Balances
 *
 * @returns Solvency result with totals, status, and breakdown
 * @throws {Error} If contract address is not configured or RPC call fails
 */
export async function checkSolvency(): Promise<SolvencyResult> {
  console.log('[Accounting] ========== Starting solvency check ==========');
  const startTime = Date.now();

  try {
    // Get escrow balances from database
    const { totalGwei: totalEscrowGwei, players: escrowPlayers } = await getTotalEscrowBalance();

    // Get table balances from database
    const { totalGwei: totalTableBalanceGwei, tables } = await getTotalTableBalance();

    // Calculate total liabilities
    const totalLiabilitiesGwei = totalEscrowGwei + totalTableBalanceGwei;

    // Get contract balance from blockchain
    const contractBalanceGwei = await getContractBalance();

    // Check solvency against total liabilities
    const isSolvent = contractBalanceGwei >= totalLiabilitiesGwei;
    const shortfallGwei = isSolvent ? null : (totalLiabilitiesGwei - contractBalanceGwei).toString();

    const elapsed = Date.now() - startTime;
    
    if (isSolvent) {
      console.log(`[Accounting] ✅ SOLVENT - Liabilities: ${totalLiabilitiesGwei} gwei (Escrow: ${totalEscrowGwei}, Tables: ${totalTableBalanceGwei}), Contract: ${contractBalanceGwei} gwei (${elapsed}ms)`);
    } else {
      console.log(`[Accounting] ⚠️  INSOLVENT - Liabilities: ${totalLiabilitiesGwei} gwei (Escrow: ${totalEscrowGwei}, Tables: ${totalTableBalanceGwei}), Contract: ${contractBalanceGwei} gwei, Shortfall: ${shortfallGwei} gwei (${elapsed}ms)`);
    }
    console.log('[Accounting] ========== Solvency check complete ==========');

    return {
      totalEscrowGwei: totalEscrowGwei.toString(),
      totalTableBalanceGwei: totalTableBalanceGwei.toString(),
      totalLiabilitiesGwei: totalLiabilitiesGwei.toString(),
      contractBalanceGwei: contractBalanceGwei.toString(),
      isSolvent,
      shortfallGwei,
      escrowBreakdown: {
        playerCount: escrowPlayers.length,
        players: escrowPlayers,
      },
      tableBreakdown: {
        tableCount: tables.length,
        tables,
      },
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Accounting] ❌ Solvency check failed after ${elapsed}ms:`, error);
    console.log('[Accounting] ========== Solvency check failed ==========');
    throw error;
  }
}
