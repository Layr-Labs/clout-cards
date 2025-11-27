/**
 * Escrow balance service
 *
 * Provides functions for fetching player escrow balance from the backend API.
 */

import { getBackendUrl } from '../config/env';

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
  const backendUrl = getBackendUrl();
  const response = await fetch(
    `${backendUrl}/playerEscrowBalance?walletAddress=${encodeURIComponent(walletAddress)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${signature}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch escrow balance' }));
    throw new Error(error.message || 'Failed to fetch escrow balance');
  }

  const data = await response.json();
  return {
    balanceGwei: data.balanceGwei,
    nextWithdrawalNonce: data.nextWithdrawalNonce,
    withdrawalSignatureExpiry: data.withdrawalSignatureExpiry,
    withdrawalPending: data.withdrawalPending,
  };
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
  const backendUrl = getBackendUrl();
  const response = await fetch(
    `${backendUrl}/signEscrowWithdrawal?walletAddress=${encodeURIComponent(walletAddress)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${signature}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amountGwei,
        toAddress,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to sign withdrawal' }));
    throw new Error(error.message || 'Failed to sign withdrawal');
  }

  return await response.json();
}

