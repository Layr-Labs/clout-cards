/**
 * Contract utilities for frontend
 *
 * Provides shared functions for creating CloutCards contract instances
 * and accessing contract ABIs.
 */

import { ethers } from 'ethers';
import { getContractAddress } from '../config/contract';

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
  'function withdraw(address player, address to, uint256 amount, uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s) external',
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
 * Creates a CloutCards contract instance for reading (events/listening)
 *
 * @param provider - Ethers provider instance
 * @param contractAddress - Contract address (optional, uses config if not provided)
 * @returns Contract instance connected to provider
 * @throws {Error} If contract address is invalid
 */
export function createCloutCardsContract(
  provider: ethers.Provider,
  contractAddress?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  if (!address) {
    throw new Error('Contract address is required');
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return new ethers.Contract(address, CLOUTCARDS_ABI, provider);
}

/**
 * Creates a CloutCards contract instance for writing (with signer)
 *
 * @param signer - Ethers signer instance
 * @param contractAddress - Contract address (optional, uses config if not provided)
 * @returns Contract instance connected to signer
 * @throws {Error} If contract address is invalid
 */
export function createCloutCardsContractWithSigner(
  signer: ethers.Signer,
  contractAddress?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  if (!address) {
    throw new Error('Contract address is required');
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return new ethers.Contract(address, CLOUTCARDS_ABI, signer);
}

/**
 * Creates a CloutCards contract instance for reading events only
 *
 * @param provider - Ethers provider instance
 * @param contractAddress - Contract address (optional, uses config if not provided)
 * @returns Contract instance connected to provider (events only)
 * @throws {Error} If contract address is invalid
 */
export function createCloutCardsEventsContract(
  provider: ethers.Provider,
  contractAddress?: string
): ethers.Contract {
  const address = contractAddress || getContractAddress();
  if (!address) {
    throw new Error('Contract address is required');
  }
  return new ethers.Contract(address, CLOUTCARDS_EVENTS_ABI, provider);
}

