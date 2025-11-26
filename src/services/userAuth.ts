/**
 * User authentication service
 *
 * Provides functions for verifying user login status (wallet + Twitter).
 * Users must have both a connected wallet with valid signature AND
 * a connected Twitter account to be considered logged in.
 */

import { verifySessionSignature } from './auth';
import { getTwitterUserInfo } from './twitter';

/**
 * Verifies that a user is fully authenticated
 *
 * A user is considered authenticated if:
 * 1. They have a valid wallet signature (from verifySessionSignature)
 * 2. They have a valid Twitter access token (can retrieve user info)
 *
 * @param address - Ethereum address that should have signed the message
 * @param signature - Wallet signature string (from signMessage)
 * @param twitterAccessToken - Twitter OAuth access token
 * @returns Promise that resolves to true if both authentications are valid
 */
export async function verifyUserAuth(
  address: string,
  signature: string,
  twitterAccessToken: string
): Promise<boolean> {
  // Verify wallet signature
  const walletValid = verifySessionSignature(address, signature);
  if (!walletValid) {
    return false;
  }

  // Verify Twitter token by attempting to get user info
  try {
    await getTwitterUserInfo(twitterAccessToken);
    return true;
  } catch (error) {
    console.error('Error verifying Twitter token:', error);
    return false;
  }
}

/**
 * Gets user authentication status
 *
 * Checks if both wallet and Twitter are authenticated without throwing errors.
 *
 * @param address - Ethereum address (optional)
 * @param signature - Wallet signature (optional)
 * @param twitterAccessToken - Twitter OAuth access token (optional)
 * @returns Promise that resolves to authentication status object
 */
export async function getUserAuthStatus(
  address?: string | null,
  signature?: string | null,
  twitterAccessToken?: string | null
): Promise<{
  walletAuthenticated: boolean;
  twitterAuthenticated: boolean;
  fullyAuthenticated: boolean;
}> {
  const walletAuthenticated = !!(address && signature && verifySessionSignature(address, signature));

  let twitterAuthenticated = false;
  if (twitterAccessToken) {
    try {
      await getTwitterUserInfo(twitterAccessToken);
      twitterAuthenticated = true;
    } catch (error) {
      // Token invalid or expired
      twitterAuthenticated = false;
    }
  }

  return {
    walletAuthenticated,
    twitterAuthenticated,
    fullyAuthenticated: walletAuthenticated && twitterAuthenticated,
  };
}

