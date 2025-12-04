/**
 * Blockchain network configuration
 *
 * Defines the supported chains for local development and production environments.
 * The frontend enforces that users connect to the correct chain based on environment.
 */

import { isProduction } from './env';

/**
 * Chain configuration for wallet interactions
 */
export interface ChainConfig {
  /** Unique chain identifier */
  chainId: number;
  /** Chain ID as hex string (for wallet RPC calls) */
  chainIdHex: string;
  /** Human-readable chain name */
  name: string;
  /** Native currency configuration */
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  /** RPC endpoint URLs */
  rpcUrls: string[];
  /** Block explorer URLs (optional) */
  blockExplorerUrls?: string[];
}

/**
 * Local development chain configuration (Anvil/Hardhat)
 *
 * Chain ID 31337 is the default for local Ethereum development nodes.
 */
export const LOCAL_CHAIN: ChainConfig = {
  chainId: 31337,
  chainIdHex: '0x7a69',
  name: 'Localhost',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['http://localhost:8545'],
};

/**
 * Base Sepolia testnet configuration
 *
 * Chain ID 84532 is the Base Sepolia testnet.
 * Public RPC endpoint from Base docs (rate-limited).
 */
export const BASE_SEPOLIA_CHAIN: ChainConfig = {
  chainId: 84532,
  chainIdHex: '0x14a34',
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

/**
 * Gets the target chain configuration based on the current environment
 *
 * @returns Chain configuration for the current environment:
 *   - Production: Base Sepolia (chain ID 84532)
 *   - Local development: Localhost (chain ID 31337)
 */
export function getTargetChain(): ChainConfig {
  return isProduction() ? BASE_SEPOLIA_CHAIN : LOCAL_CHAIN;
}

/**
 * Formats chain ID as hex string for wallet RPC calls
 *
 * @param chainId - Numeric chain ID
 * @returns Hex string (e.g., "0x7a69" for 31337)
 */
export function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

