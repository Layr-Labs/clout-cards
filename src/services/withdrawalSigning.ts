/**
 * Withdrawal signing service
 *
 * Handles signing withdrawal requests for player escrow balances.
 * This service computes withdrawal digests using the contract's computeWithdrawDigest function
 * and signs them with the TEE's private key.
 */

import { ethers } from 'ethers';
import { getStringEnv, isProduction } from '../config/env';
import { withEvent, EventKind } from '../db/events';
import { getEscrowBalanceWithWithdrawal } from './escrowBalance';
import { createCloutCardsFunctionsContract, getContractAddress } from '../utils/contract';
import { prisma } from '../db/client';

/**
 * Signs a withdrawal request for a player
 *
 * This function:
 * 1. Validates that no withdrawal is currently pending
 * 2. Validates that the withdrawal amount does not exceed escrow balance
 * 3. Computes the withdrawal digest using the contract's computeWithdrawDigest function
 * 4. Creates a withdrawal request event and updates the escrow balance nonce/expiry atomically
 * 5. Signs the digest and returns the signature components
 *
 * @param walletAddress - Player wallet address (must match connected wallet)
 * @param toAddress - Recipient address for the withdrawal
 * @param amountGwei - Amount to withdraw in gwei
 * @param expirySeconds - Expiry time in seconds from now (default: 1 minute for local dev, 5 minutes for production)
 *
 * @returns Signature components (v, r, s), nonce, and expiry
 *
 * @throws {Error} If withdrawal is already pending
 * @throws {Error} If withdrawal amount exceeds escrow balance
 * @throws {Error} If contract call fails
 */
export async function signEscrowWithdrawal(
  walletAddress: string,
  toAddress: string,
  amountGwei: bigint,
  expirySeconds: number = isProduction() ? 5 * 60 : 60 // 5 minutes for production, 1 minute for local dev
): Promise<{
  nonce: bigint;
  expiry: bigint;
  v: number;
  r: string;
  s: string;
}> {
  // Normalize addresses
  const normalizedAddress = walletAddress.toLowerCase();
  const normalizedTo = ethers.getAddress(toAddress);

  // Validate amount
  if (amountGwei <= 0n) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  // Get contract address from environment
  const contractAddress = getContractAddress();

  // Get current escrow balance and withdrawal state
  const escrowState = await getEscrowBalanceWithWithdrawal(normalizedAddress);

  // Validate no pending withdrawal
  if (escrowState.withdrawalPending) {
    throw new Error('A withdrawal is already pending. Please wait for it to expire or be executed.');
  }

  // Validate withdrawal amount does not exceed balance
  if (amountGwei > escrowState.balanceGwei) {
    throw new Error(
      `Withdrawal amount (${amountGwei} gwei) exceeds escrow balance (${escrowState.balanceGwei} gwei)`
    );
  }

  // Compute expiry timestamp (current time + expiry seconds)
  const now = Math.floor(Date.now() / 1000);
  const expiry = BigInt(now + expirySeconds);

  // Convert amount from gwei to wei for contract call
  const amountWei = amountGwei * BigInt(10 ** 9);

  // Get contract instance and call computeWithdrawDigest
  const contract = createCloutCardsFunctionsContract(contractAddress);
  let digest: string;
  let nonce: bigint;

  try {
    const result = await contract.computeWithdrawDigest(
      normalizedAddress,
      normalizedTo,
      amountWei,
      expiry
    );
    digest = result[0];
    nonce = result[1];
  } catch (error) {
    console.error('Error calling computeWithdrawDigest:', error);
    throw new Error(`Failed to compute withdrawal digest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Create payload JSON for the withdrawal request event
  const payloadJson = JSON.stringify({
    walletAddress: normalizedAddress,
    toAddress: normalizedTo,
    amountGwei: amountGwei.toString(),
    amountWei: amountWei.toString(),
    nonce: nonce.toString(),
    expiry: expiry.toString(),
    digest,
  });

  console.log(`🔐 Signing withdrawal request for ${normalizedAddress}:`);
  console.log(`   Amount: ${amountGwei} gwei (${ethers.formatEther(amountWei)} ETH)`);
  console.log(`   To: ${normalizedTo}`);
  console.log(`   Nonce: ${nonce}`);
  console.log(`   Expiry: ${new Date(Number(expiry) * 1000).toISOString()}`);

  // Atomically create withdrawal request event and update escrow balance nonce/expiry
  // This ensures race conditions are prevented - if two requests come in, only one succeeds
  try {
    await withEvent(
      EventKind.WITHDRAWAL_REQUEST,
      payloadJson,
      async (tx) => {
        // Check again for pending withdrawal within the transaction (double-check for race conditions)
        const existingBalances = await tx.$queryRaw<Array<{
          wallet_address: string;
          withdrawal_signature_expiry: Date | null;
        }>>`
          SELECT wallet_address, withdrawal_signature_expiry
          FROM player_escrow_balances
          WHERE LOWER(wallet_address) = LOWER(${normalizedAddress})
          LIMIT 1
        `;

        if (existingBalances.length > 0) {
          const existingAddress = existingBalances[0].wallet_address;
          const existingExpiry = existingBalances[0].withdrawal_signature_expiry;
          const now = new Date();

          // If there's a pending withdrawal (expiry exists and is in the future), reject
          if (existingExpiry !== null && existingExpiry > now) {
            throw new Error('A withdrawal is already pending. Please wait for it to expire or be executed.');
          }

          // Update existing balance with new nonce and expiry
          // Use raw SQL to avoid TypeScript type inference issues with transaction client
          const expiryTimestamp = new Date(Number(expiry) * 1000).toISOString();
          await tx.$executeRaw`
            UPDATE player_escrow_balances
            SET next_withdrawal_nonce = ${nonce},
                withdrawal_signature_expiry = ${expiryTimestamp}::timestamp
            WHERE wallet_address = ${existingAddress}
          `;
        } else {
          // Create new balance entry (shouldn't happen if withdrawal is requested, but handle it)
          throw new Error(`No escrow balance found for ${normalizedAddress}. Deposit funds before withdrawing.`);
        }
      },
      normalizedAddress,
      nonce
    );
  } catch (error) {
    console.error(`❌ Error creating withdrawal request for ${normalizedAddress}:`, error);
    throw error;
  }

  // Sign the digest using the TEE's private key
  // Note: We sign the contract's digest directly, not our own payload digest
  // The contract digest is what will be verified on-chain
  // We need to get the TEE wallet from MNEMONIC
  const mnemonic = getStringEnv('MNEMONIC', '');
  if (!mnemonic) {
    throw new Error('MNEMONIC environment variable is required for signing withdrawals');
  }
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  const signature = wallet.signingKey.sign(digest);

  console.log(`✅ Withdrawal request signed for ${normalizedAddress}`);

  return {
    nonce,
    expiry,
    v: signature.v,
    r: signature.r,
    s: signature.s,
  };
}

