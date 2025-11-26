/**
 * Authentication and authorization service
 *
 * Provides functions for verifying wallet signatures and admin authorization.
 */

import { ethers } from 'ethers';
import { isAdmin } from './admins';
import { generateSessionMessage } from '../utils/messages';

/**
 * Verifies that a signature was created by signing the session message for the given address
 *
 * This function:
 * 1. Generates the expected session message for the address
 * 2. Recovers the signer from the signature
 * 3. Verifies the recovered address matches the provided address
 *
 * @param address - Ethereum address that should have signed the message
 * @param signature - Signature string (from signMessage)
 * @returns true if signature is valid, false otherwise
 */
export function verifySessionSignature(address: string, signature: string): boolean {
  try {
    if (!ethers.isAddress(address)) {
      return false;
    }

    const message = generateSessionMessage(address);
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Compare addresses in checksum format
    return ethers.getAddress(recoveredAddress.toLowerCase()) === ethers.getAddress(address);
  } catch (error) {
    console.error('Error verifying session signature:', error);
    return false;
  }
}

/**
 * Verifies that the caller is an admin by checking:
 * 1. The address is a valid admin address
 * 2. The signature is valid for the session message
 *
 * @param address - Ethereum address to verify as admin
 * @param signature - Session signature from localStorage
 * @returns true if address is admin and signature is valid, false otherwise
 */
export function verifyAdminAuth(address: string, signature: string): boolean {
  if (!address || !signature) {
    return false;
  }

  // First verify the signature is valid
  if (!verifySessionSignature(address, signature)) {
    return false;
  }

  // Then verify the address is an admin
  return isAdmin(address);
}

