/**
 * RPC Provider utilities
 *
 * Provides shared functions for creating Ethereum RPC providers
 * with consistent logic for local development vs production.
 */

import { ethers } from 'ethers';
import { getStringEnv, isProduction } from '../config/env';

/**
 * Gets the RPC URL for the current environment
 *
 * For local development, always uses Anvil default RPC (http://localhost:8545).
 * For production, uses RPC_URL environment variable.
 *
 * @param rpcUrl - Optional explicit RPC URL (takes precedence)
 * @returns RPC URL string
 * @throws {Error} If RPC_URL is not set in production
 */
export function getRpcUrl(rpcUrl?: string): string {
  // If explicit URL provided, use it
  if (rpcUrl) {
    return rpcUrl;
  }

  // For local development, always use Anvil default RPC
  // In production, use RPC_URL env var
  const isProd = isProduction();
  const envRpcUrl = isProd ? getStringEnv('RPC_URL', '') : 'http://localhost:8545';

  if (!envRpcUrl) {
    throw new Error('RPC_URL is required in production');
  }

  return envRpcUrl;
}

/**
 * Creates an Ethereum RPC provider for the current environment
 *
 * @param rpcUrl - Optional explicit RPC URL (takes precedence)
 * @returns JsonRpcProvider instance
 * @throws {Error} If RPC_URL is not set in production
 */
export function createRpcProvider(rpcUrl?: string): ethers.JsonRpcProvider {
  const providerUrl = getRpcUrl(rpcUrl);
  return new ethers.JsonRpcProvider(providerUrl);
}

