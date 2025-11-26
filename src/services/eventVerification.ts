/**
 * Event signature verification service
 *
 * Provides functions to verify that event signatures were created by the TEE.
 */

import { ethers } from 'ethers';
import { computePayloadDigest } from '../db/eip712';

/**
 * Verifies that an event signature was created by the TEE
 *
 * This function:
 * 1. Reconstructs the EIP-712 digest from the event data
 * 2. Recovers the signer from the signature components (r, s, v)
 * 3. Compares the recovered signer with the expected TEE public key
 *
 * @param kind - Event kind
 * @param payloadJson - Canonical JSON payload string
 * @param digest - Expected EIP-712 digest (for verification)
 * @param sigR - Signature component R
 * @param sigS - Signature component S
 * @param sigV - Signature component V
 * @param teePubkey - Expected TEE public key (address)
 * @param nonce - Optional nonce (for withdrawal events)
 *
 * @returns true if signature is valid and matches TEE, false otherwise
 */
export function verifyEventSignature(
  kind: string,
  payloadJson: string,
  digest: string,
  sigR: string,
  sigS: string,
  sigV: number,
  teePubkey: string,
  nonce?: bigint | null
): boolean {
  try {
    // Reconstruct the digest to verify it matches
    const computedDigest = computePayloadDigest(kind, payloadJson, nonce || undefined);
    if (computedDigest.toLowerCase() !== digest.toLowerCase()) {
      console.error('Digest mismatch:', { computedDigest, providedDigest: digest });
      return false;
    }

    // Recover the signer from the signature
    const signature = ethers.Signature.from({
      r: sigR,
      s: sigS,
      v: sigV,
    });

    const recoveredAddress = ethers.recoverAddress(computedDigest, signature);

    // Compare with expected TEE public key
    const matches = ethers.getAddress(recoveredAddress.toLowerCase()) === ethers.getAddress(teePubkey.toLowerCase());

    return matches;
  } catch (error) {
    console.error('Error verifying event signature:', error);
    return false;
  }
}

