/**
 * EIP-712 signature utilities for event signing
 *
 * This module provides functions to compute EIP-712 digests and sign events
 * using the TEE's private key derived from the MNEMONIC environment variable.
 *
 * Events are signed using EIP-712 typed data signing on the payload_json directly.
 * The digest is computed from the canonical JSON payload, ensuring integrity
 * of the RPC call that mutated logical state.
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Determines if we're running in production
 *
 * Production is detected when:
 * - NODE_ENV === 'production', OR
 * - ENVIRONMENT === 'production'
 *
 * Otherwise, assumes local development.
 *
 * @returns true if in production, false for local development
 */
function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  );
}

/**
 * Default chain ID for local development
 *
 * Uses Anvil's default chain ID (31337) for local Ethereum node testing.
 * Anvil is Foundry's local Ethereum node - recommended for local development.
 * Can be overridden via CHAIN_ID environment variable.
 */
const LOCAL_DEFAULT_CHAIN_ID = 31337; // Anvil default chain ID

/**
 * Gets the chain ID from environment variables
 *
 * For local development, defaults to Anvil's chain ID (31337) if not set.
 * For production, requires CHAIN_ID to be explicitly set.
 *
 * @returns Chain ID as a number
 * @throws {Error} If CHAIN_ID is not set in production, or if invalid
 */
function getChainId(): number {
  const isProd = isProduction();
  const chainId = process.env.CHAIN_ID;

  if (!chainId) {
    if (isProd) {
      throw new Error('CHAIN_ID environment variable is required in production');
    } else {
      // Local development: use default
      return LOCAL_DEFAULT_CHAIN_ID;
    }
  }

  const parsed = parseInt(chainId, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid CHAIN_ID: "${chainId}". Must be a positive integer.`);
  }
  return parsed;
}

/**
 * Gets the EIP-712 domain for event signatures
 *
 * This domain is used for all event signatures to ensure they are chain-specific
 * and contract-specific, preventing replay attacks across different chains or deployments.
 *
 * The chainId is read from the CHAIN_ID environment variable and must be set.
 * This function constructs a fresh domain object each time to ensure the chainId
 * is read from the environment at the time of signing.
 *
 * @returns EIP-712 domain object
 * @throws {Error} If CHAIN_ID is not set or invalid
 */
function getEIP712Domain() {
  return {
    name: 'CloutCardsEvents',
    version: '1',
    chainId: getChainId(),
    verifyingContract: ethers.ZeroAddress, // Events are not tied to a specific contract
  };
}

/**
 * EIP-712 types for RPC Payload struct
 *
 * The payload_json is signed directly as typed data. The structure depends on
 * the event kind (deposit, withdraw, bet, etc.), but we sign the raw JSON string
 * as a canonical representation of the RPC call.
 */
const PAYLOAD_TYPES = {
  RPCPayload: [
    { name: 'kind', type: 'string' },
    { name: 'payload', type: 'string' }, // Canonical JSON string
    { name: 'nonce', type: 'uint256' }, // Optional, only for withdrawal events
  ],
};

/**
 * Gets the TEE wallet from MNEMONIC environment variable
 *
 * @returns Wallet instance derived from MNEMONIC
 * @throws {Error} If MNEMONIC is not set in environment variables
 */
function getTeeWallet(): ethers.HDNodeWallet {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error('MNEMONIC environment variable is required for event signing');
  }
  return ethers.Wallet.fromPhrase(mnemonic);
}

/**
 * Computes the EIP-712 digest for an RPC payload
 *
 * This function creates the typed data hash that will be signed by the TEE.
 * The digest is computed from the canonical JSON payload, ensuring that any
 * modification to the payload will invalidate the signature.
 *
 * @param kind - Event kind (deposit, withdraw, bet, hand_start, hand_end, join_table, etc.)
 * @param payloadJson - Canonical JSON string of the RPC call payload
 * @param nonce - Optional nonce for replay protection (only for withdrawal events)
 *
 * @returns EIP-712 typed data digest (bytes32)
 */
export function computePayloadDigest(
  kind: string,
  payloadJson: string,
  nonce?: bigint
): string {
  const message = {
    kind,
    payload: payloadJson,
    nonce: nonce || BigInt(0),
  };

  return ethers.TypedDataEncoder.hash(getEIP712Domain(), PAYLOAD_TYPES, message);
}

/**
 * Signs an RPC payload using the TEE's private key
 *
 * Computes the EIP-712 digest from the payload_json and signs it with
 * the wallet derived from MNEMONIC.
 *
 * @param kind - Event kind
 * @param payloadJson - Canonical JSON string of the RPC call payload
 * @param nonce - Optional nonce for replay protection (only for withdrawal events)
 *
 * @returns EIP-712 signature (v, r, s components)
 */
export function signPayload(
  kind: string,
  payloadJson: string,
  nonce?: bigint
): { v: number; r: string; s: string } {
  const digest = computePayloadDigest(kind, payloadJson, nonce);

  const wallet = getTeeWallet();
  const signature = wallet.signingKey.sign(digest);

  return {
    v: signature.v,
    r: signature.r,
    s: signature.s,
  };
}

/**
 * Gets the TEE's public address
 *
 * This address can be used to verify event signatures.
 *
 * @returns Public address of the TEE wallet
 */
export function getTeeAddress(): string {
  const wallet = getTeeWallet();
  return wallet.address;
}

/**
 * Gets the TEE's public key (Ethereum address format)
 *
 * This public key is stored in events to allow third parties to verify signatures.
 * For Ethereum, we store the address (42 characters) rather than the full public key.
 *
 * @returns TEE address as hex string (42 characters: 0x + 40 hex chars)
 */
export function getTeePublicKey(): string {
  return getTeeAddress();
}
