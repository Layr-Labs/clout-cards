import { ethers } from 'ethers';
import { isProduction } from '../config/env';
import { ANVIL_DEFAULT_ADDRESS } from '../config/constants';

/**
 * Admin Data Service
 *
 * Provides admin address management based on environment configuration.
 * Returns different admin lists for local development vs production.
 */

/**
 * Parses a comma-separated list of admin addresses
 *
 * Validates that each address is a valid Ethereum address format.
 * Filters out empty strings and normalizes addresses to lowercase.
 *
 * @param addressesStr - Comma-separated string of addresses
 * @returns Array of valid, normalized addresses
 * @throws {Error} If any address is invalid
 */
function parseAdminAddresses(addressesStr: string): string[] {
  if (!addressesStr || addressesStr.trim() === '') {
    return [];
  }

  const addresses = addressesStr
    .split(',')
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);

  // Validate all addresses
  const invalidAddresses: string[] = [];
  const validAddresses: string[] = [];

  for (const address of addresses) {
    if (!ethers.isAddress(address)) {
      invalidAddresses.push(address);
    } else {
      // Normalize to lowercase checksum format
      validAddresses.push(ethers.getAddress(address));
    }
  }

  if (invalidAddresses.length > 0) {
    throw new Error(
      `Invalid admin addresses found: ${invalidAddresses.join(', ')}`
    );
  }

  return validAddresses;
}

/**
 * Gets the list of admin addresses based on the current environment
 *
 * Local Development:
 * - Returns the first Anvil default address (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
 *
 * Production:
 * - Parses ADMIN_ADDRESSES environment variable (comma-separated)
 * - Returns empty array if ADMIN_ADDRESSES is missing, empty, or blank
 * - Validates all addresses and throws error if any are invalid
 *
 * @returns Array of admin addresses (normalized to checksum format)
 * @throws {Error} If ADMIN_ADDRESSES contains invalid addresses in production
 */
export function getAdminAddresses(): string[] {
  const isProd = isProduction();

  if (isProd) {
    // Production: use ADMIN_ADDRESSES env var
    const adminAddressesStr = process.env.ADMIN_ADDRESSES;

    if (!adminAddressesStr || adminAddressesStr.trim() === '') {
      // No admins configured - return empty array
      return [];
    }

    return parseAdminAddresses(adminAddressesStr);
  } else {
    // Local development: return Anvil's first default address
    return [ANVIL_DEFAULT_ADDRESS];
  }
}

/**
 * Checks if an address is an admin
 *
 * @param address - Ethereum address to check
 * @returns true if the address is an admin, false otherwise
 */
export function isAdmin(address: string): boolean {
  if (!address || !ethers.isAddress(address)) {
    return false;
  }

  const normalizedAddress = ethers.getAddress(address);
  const admins = getAdminAddresses();

  return admins.includes(normalizedAddress);
}
