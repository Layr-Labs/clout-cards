/**
 * Message generation utilities
 *
 * Provides reusable functions for generating messages that need to be signed
 * by users for authentication or authorization purposes.
 */

import { ethers } from 'ethers';

/**
 * Generates a session message for wallet signature authentication
 *
 * The message format is: "Sign on to Clout Cards with address {ADDRESS}"
 * where ADDRESS is the checksum format of the Ethereum address.
 *
 * @param address - Ethereum address to include in the message
 * @returns Session message string
 * @throws {Error} If address is invalid
 */
export function generateSessionMessage(address: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }

  const checksumAddress = ethers.getAddress(address);
  return `Sign on to Clout Cards with address ${checksumAddress}`;
}

