/**
 * Escrow balance service
 *
 * Provides functions for fetching player escrow balance from the backend API.
 */

import { apiClient } from './apiClient';

/**
 * Escrow balance with withdrawal state
 */
export interface EscrowBalanceState {
  balanceGwei: string;
  nextWithdrawalNonce: string | null;
  withdrawalSignatureExpiry: string | null;
  withdrawalPending: boolean;
}

/**
 * Gets the escrow balance with withdrawal state for the current user's wallet
 *
 * @param walletAddress - Ethereum wallet address
 * @param signature - Session signature for authentication
 * @returns Escrow balance state including withdrawal information
 * @throws {Error} If the API request fails
 */
export async function getEscrowBalance(walletAddress: string, signature: string): Promise<EscrowBalanceState> {
  return apiClient<EscrowBalanceState>('/playerEscrowBalance', {
    requireAuth: true,
    signature,
    walletAddress,
  });
}

/**
 * Signs a withdrawal request for the current user's escrow balance
 *
 * @param walletAddress - Ethereum wallet address
 * @param signature - Session signature for authentication
 * @param amountGwei - Amount to withdraw in gwei (as string)
 * @param toAddress - Recipient address (must match walletAddress)
 * @returns Withdrawal signature components
 * @throws {Error} If the API request fails
 */
export async function signEscrowWithdrawal(
  walletAddress: string,
  signature: string,
  amountGwei: string,
  toAddress: string
): Promise<{
  nonce: string;
  expiry: string;
  v: number;
  r: string;
  s: string;
}> {
  return apiClient<{
    nonce: string;
    expiry: string;
    v: number;
    r: string;
    s: string;
  }>('/signEscrowWithdrawal', {
    method: 'POST',
    requireAuth: true,
    signature,
    walletAddress,
    body: JSON.stringify({
      amountGwei,
      toAddress,
    }),
  });
}

