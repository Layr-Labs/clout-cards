/**
 * TEE Verification Utilities
 *
 * Provides client-side verification of TEE signatures and deck commitments.
 * These functions allow users to independently verify that:
 * 1. All events were signed by the TEE (signature recovery matches TEE pubkey)
 * 2. The deck commitment from hand_start matches the revealed deck in hand_end
 */

import { ethers } from 'ethers';
import type { HandEvent, EIP712Domain } from '../services/handHistory';
import type { Card } from '../services/tables';

/**
 * EIP-712 types for RPC Payload struct (must match backend)
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
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** The address recovered from the signature */
  recoveredAddress: string;
  /** The expected TEE address */
  expectedAddress: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Result of deck commitment verification
 */
export interface DeckVerificationResult {
  /** Whether the deck commitment matches */
  valid: boolean;
  /** The hash computed from the deck JSON */
  computedHash: string;
  /** The hash committed at hand start */
  expectedHash: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Verifies an event signature against the TEE public key
 *
 * This function:
 * 1. Computes the EIP-712 typed data hash from the payload
 * 2. Recovers the signer address from the signature components
 * 3. Compares the recovered address to the expected TEE address
 *
 * @param event - The event to verify
 * @param domain - EIP-712 domain from the backend
 * @returns Verification result with recovered and expected addresses
 *
 * @example
 * ```typescript
 * const result = verifyEventSignature(event, eip712Domain);
 * if (result.valid) {
 *   console.log('Signature valid!');
 * } else {
 *   console.error(`Invalid: expected ${result.expectedAddress}, got ${result.recoveredAddress}`);
 * }
 * ```
 */
export function verifyEventSignature(
  event: HandEvent,
  domain: EIP712Domain
): SignatureVerificationResult {
  try {
    // Create the message object that was signed
    const message = {
      kind: event.kind,
      payload: event.payloadJson,
      nonce: BigInt(0), // Non-withdrawal events use nonce 0
    };

    // Compute the EIP-712 digest (same as backend)
    const digest = ethers.TypedDataEncoder.hash(domain, PAYLOAD_TYPES, message);

    // Verify the digest matches what the backend computed
    if (digest.toLowerCase() !== event.digest.toLowerCase()) {
      return {
        valid: false,
        recoveredAddress: '0x0',
        expectedAddress: event.teePubkey,
        error: `Digest mismatch: computed ${digest}, expected ${event.digest}`,
      };
    }

    // Recover the signer from the signature
    const signature = ethers.Signature.from({
      r: event.sigR,
      s: event.sigS,
      v: event.sigV,
    });

    const recoveredAddress = ethers.recoverAddress(digest, signature);

    // Compare addresses (case-insensitive)
    const valid =
      ethers.getAddress(recoveredAddress.toLowerCase()) ===
      ethers.getAddress(event.teePubkey.toLowerCase());

    return {
      valid,
      recoveredAddress,
      expectedAddress: event.teePubkey,
    };
  } catch (error) {
    return {
      valid: false,
      recoveredAddress: '0x0',
      expectedAddress: event.teePubkey,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verifies that a deck matches its commitment hash
 *
 * The backend commits to the deck at hand_start by computing:
 *   keccak256(JSON.stringify(deck) + nonce)
 *
 * where nonce is a 256-bit random value generated at hand start. The nonce
 * makes it computationally infeasible to brute-force the commitment.
 *
 * This function recomputes that hash from the revealed deck and nonce and compares.
 *
 * @param shuffleSeedHash - The commitment hash published at hand_start
 * @param deck - The full deck revealed at hand_end
 * @param nonce - The secret nonce revealed at hand_end (256-bit hex string)
 * @returns Verification result with computed and expected hashes
 *
 * @example
 * ```typescript
 * if (hand.deck && hand.deckNonce) {
 *   const result = verifyDeckCommitment(hand.shuffleSeedHash, hand.deck, hand.deckNonce);
 *   if (result.valid) {
 *     console.log('Deck commitment verified!');
 *   } else {
 *     console.error('Deck was modified after commitment!');
 *   }
 * }
 * ```
 */
export function verifyDeckCommitment(
  shuffleSeedHash: string,
  deck: Card[],
  nonce: string
): DeckVerificationResult {
  try {
    // Normalize card key ordering to match backend: { suit, rank }
    // PostgreSQL JSONB doesn't preserve key order, so we must ensure
    // consistent ordering when re-stringifying for hash verification
    const normalizedDeck = deck.map((card) => ({
      suit: card.suit,
      rank: card.rank,
    }));
    const deckJson = JSON.stringify(normalizedDeck);
    // Commitment = keccak256(deck || nonce)
    const computedHash = ethers.keccak256(ethers.toUtf8Bytes(deckJson + nonce));

    // Compare hashes (case-insensitive)
    const valid = computedHash.toLowerCase() === shuffleSeedHash.toLowerCase();

    return {
      valid,
      computedHash,
      expectedHash: shuffleSeedHash,
    };
  } catch (error) {
    return {
      valid: false,
      computedHash: '0x0',
      expectedHash: shuffleSeedHash,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verifies all events for a hand and returns a summary
 *
 * @param events - Array of events to verify
 * @param domain - EIP-712 domain from the backend
 * @returns Object with verification results and summary
 *
 * @example
 * ```typescript
 * const results = verifyAllEvents(events, eip712Domain);
 * console.log(`${results.validCount}/${results.totalCount} events verified`);
 * ```
 */
export function verifyAllEvents(
  events: HandEvent[],
  domain: EIP712Domain
): {
  results: SignatureVerificationResult[];
  validCount: number;
  totalCount: number;
  allValid: boolean;
} {
  const results = events.map((event) => verifyEventSignature(event, domain));
  const validCount = results.filter((r) => r.valid).length;

  return {
    results,
    validCount,
    totalCount: events.length,
    allValid: validCount === events.length,
  };
}

/**
 * Formats an address for display (shortened)
 *
 * @param address - Full Ethereum address
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function formatAddressShort(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

