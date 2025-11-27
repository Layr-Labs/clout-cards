/**
 * Contract utilities
 *
 * Provides shared functions for creating CloutCards contract instances
 * and accessing contract ABIs.
 */

import { ethers } from 'ethers';
import { getStringEnv } from '../config/env';
import { createRpcProvider } from './rpcProvider';

/**
 * CloutCards contract ABI fragments
 * 
 * Split into logical groups for different use cases:
 * - Events: For listening to contract events
 * - Functions: For calling contract functions
 */

/**
 * CloutCards contract events ABI
 */
export const CLOUTCARDS_EVENTS_ABI = [
  'event Deposited(address indexed player, address indexed depositor, uint256 amount)',
  'event WithdrawalExecuted(address indexed player, address indexed to, uint256 amount, uint256 nonce)',
] as const;

/**
 * CloutCards contract functions ABI
 */
export const CLOUTCARDS_FUNCTIONS_ABI = [
  'function computeWithdrawDigest(address player, address to, uint256 amount, uint256 expiry) public view returns (bytes32, uint256)',
] as const;

/**
 * Full CloutCards contract ABI (events + functions)
 */
export const CLOUTCARDS_ABI = [
  ...CLOUTCARDS_EVENTS_ABI,
  ...CLOUTCARDS_FUNCTIONS_ABI,
] as const;

/**
 * Gets the CloutCards contract address from environment
 *
 * @returns Contract address string
 * @throws {Error} If CLOUTCARDS_CONTRACT_ADDRESS is not set
 */
export function getContractAddress(): string {
  const address = getStringEnv('CLOUTCARDS_CONTRACT_ADDRESS', '');
  if (!address) {
    throw new Error('CLOUTCARDS_CONTRACT_ADDRESS environment variable is required');
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
}

/**
 * Creates a CloutCards contract instance for reading (events/listening)
 *
 * @param contractAddress - Contract address (optional, uses env var if not provided)
 * @param rpcUrl - Optional RPC URL (uses default for environment if not provided)
 * @returns Contract instance connected to provider
 * @throws {Error} If contract address is invalid or RPC connection fails
 */
export function createCloutCardsContract(
  contractAddress?: string,
  rpcUrl?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  const provider = createRpcProvider(rpcUrl);
  return new ethers.Contract(address, CLOUTCARDS_ABI, provider);
}

/**
 * Creates a CloutCards contract instance for reading events only
 *
 * @param contractAddress - Contract address (optional, uses env var if not provided)
 * @param rpcUrl - Optional RPC URL (uses default for environment if not provided)
 * @returns Contract instance connected to provider (events only)
 * @throws {Error} If contract address is invalid or RPC connection fails
 */
export function createCloutCardsEventsContract(
  contractAddress?: string,
  rpcUrl?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  const provider = createRpcProvider(rpcUrl);
  return new ethers.Contract(address, CLOUTCARDS_EVENTS_ABI, provider);
}

/**
 * Creates a CloutCards contract instance for calling functions only
 *
 * @param contractAddress - Contract address (optional, uses env var if not provided)
 * @param rpcUrl - Optional RPC URL (uses default for environment if not provided)
 * @returns Contract instance connected to provider (functions only)
 * @throws {Error} If contract address is invalid or RPC connection fails
 */
export function createCloutCardsFunctionsContract(
  contractAddress?: string,
  rpcUrl?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  const provider = createRpcProvider(rpcUrl);
  return new ethers.Contract(address, CLOUTCARDS_FUNCTIONS_ABI, provider);
}

