/**
 * Event chain management and RPC call logging
 *
 * This module provides the top-level abstraction for logging RPC calls processed by the TEE.
 * Every RPC call that mutates logical state must be logged as an event, which:
 * 1. Stores the canonical JSON payload
 * 2. Computes the EIP-712 digest of the payload
 * 3. Signs the payload with the TEE's private key
 * 4. Stores signature components (r, s, v) separately
 * 5. Includes TEE metadata (version, public key)
 *
 * The event table is the single source of truth - all other tables are caches
 * that can be regenerated from events by replaying RPC calls.
 */

import { prisma } from './client';
import { signPayload, getTeeAddress, getTeePublicKey, computePayloadDigest } from './eip712';

/**
 * Event kind enumeration
 *
 * These represent the types of RPC calls that can mutate logical state.
 * Each kind corresponds to a specific operation (deposit, withdraw, bet, etc.).
 */
export enum EventKind {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  BET = 'bet',
  HAND_START = 'hand_start',
  HAND_END = 'hand_end',
  JOIN_TABLE = 'join_table',
  LEAVE_TABLE = 'leave_table',
  CREATE_TABLE = 'create_table',
  // Add more as needed
}

/**
 * TEE version - should match the version of the TEE binary
 *
 * This can be set via environment variable or hardcoded. It's included in
 * every event to allow verification against specific TEE versions.
 */
import { parseIntEnv } from '../config/env';

const TEE_VERSION = parseIntEnv('TEE_VERSION', 1, 1);

/**
 * Creates an event in the event table
 *
 * This is the core function that ensures all RPC calls are logged with:
 * - Canonical JSON payload (payload_json)
 * - EIP-712 digest of the payload
 * - TEE signature (r, s, v components)
 * - TEE metadata (version, public key)
 * - Optional player and nonce for replay protection
 *
 * @param kind - Event kind (deposit, withdraw, bet, etc.)
 * @param payloadJson - Canonical JSON string of the RPC call payload
 * @param player - Optional player address that the event concerns
 * @param nonce - Optional nonce for replay protection (required for withdrawal events)
 * @param blockTs - Optional timestamp when event was finalized at TEE (defaults to now)
 *
 * @returns The created event record
 *
 * @throws {Error} If event creation fails or signature generation fails
 */
export async function createEvent(
  kind: EventKind | string,
  payloadJson: string,
  player?: string | null,
  nonce?: bigint | null,
  blockTs?: Date
): Promise<{
  eventId: number;
  blockTs: Date;
  player: string | null;
  kind: string;
  payloadJson: string;
  digest: string;
  sigR: string;
  sigS: string;
  sigV: number;
  nonce: bigint | null;
  teeVersion: number;
  teePubkey: string;
  ingestedAt: Date;
}> {
  const timestamp = blockTs || new Date();
  const teePubkey = getTeePublicKey();

  // Compute digest first (same as what will be signed)
  const digest = computePayloadDigest(kind, payloadJson, nonce || undefined);

  // Sign the payload
  const signature = signPayload(kind, payloadJson, nonce || undefined);

  // Create the event record
  const event = await prisma.event.create({
    data: {
      blockTs: timestamp,
      player: player || null,
      kind,
      payloadJson,
      digest,
      sigR: signature.r,
      sigS: signature.s,
      sigV: signature.v,
      nonce: nonce || null,
      teeVersion: TEE_VERSION,
      teePubkey,
      ingestedAt: new Date(),
    },
  });

  return event;
}

/**
 * Creates an event within an existing transaction context
 *
 * Use this when you're already inside a transaction and want to add an event.
 * The event will be created using the provided transaction context.
 *
 * @param tx - Prisma transaction client
 * @param kind - Event kind
 * @param payloadJson - Canonical JSON string of the RPC call payload
 * @param player - Optional player address
 * @param nonce - Optional nonce for replay protection
 * @param blockTs - Optional timestamp when event was finalized at TEE (defaults to now)
 *
 * @returns The created event record
 *
 * @throws {Error} If event creation fails
 */
export async function createEventInTransaction(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  kind: EventKind | string,
  payloadJson: string,
  player?: string | null,
  nonce?: bigint | null,
  blockTs?: Date
): Promise<void> {
  const timestamp = blockTs || new Date();
  const teePubkey = getTeePublicKey();

  // Compute digest first (same as what will be signed)
  const digest = computePayloadDigest(kind, payloadJson, nonce || undefined);

  // Sign the payload
  const signature = signPayload(kind, payloadJson, nonce || undefined);

  // Create the event record using transaction context
  await tx.event.create({
    data: {
      blockTs: timestamp,
      player: player || null,
      kind,
      payloadJson,
      digest,
      sigR: signature.r,
      sigS: signature.s,
      sigV: signature.v,
      nonce: nonce || null,
      teeVersion: TEE_VERSION,
      teePubkey,
      ingestedAt: new Date(),
    },
  });
}

/**
 * Wraps an RPC call handler to ensure an event is always created
 *
 * This function ensures that every RPC call that mutates logical state is logged
 * as an event. It wraps the handler in a transaction to ensure atomicity.
 *
 * @param kind - Event kind
 * @param payloadJson - Canonical JSON string of the RPC call payload
 * @param player - Optional player address
 * @param nonce - Optional nonce for replay protection
 * @param handler - Function that processes the RPC call and mutates state (receives tx as parameter)
 *
 * @returns Result of the handler function
 *
 * @throws {Error} If handler or event creation fails (transaction rolls back)
 */
export async function withEvent<T>(
  kind: EventKind | string,
  payloadJson: string,
  handler: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
  player?: string | null,
  nonce?: bigint | null
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    // Process the RPC call (mutate cache tables, etc.)
    const result = await handler(tx);

    // Create the event using transaction context
    await createEventInTransaction(tx, kind, payloadJson, player, nonce);

    return result;
  });
}

/**
 * Gets the latest event ID
 *
 * This can be used for sequencing or to get the current state of the event log.
 *
 * @returns The latest event ID, or 0 if no events exist
 */
export async function getLatestEventId(): Promise<number> {
  const latestEvent = await prisma.event.findFirst({
    orderBy: { eventId: 'desc' },
    select: { eventId: true },
  });
  return latestEvent?.eventId || 0;
}

/**
 * Gets the most recent events from the event table
 *
 * @param limit - Maximum number of events to return (default: 50)
 * @returns Array of recent events ordered by eventId descending
 */
export async function getRecentEvents(limit: number = 50): Promise<Array<{
  eventId: number;
  blockTs: Date;
  player: string | null;
  kind: string;
  payloadJson: string;
  digest: string;
  sigR: string;
  sigS: string;
  sigV: number;
  nonce: bigint | null;
  teeVersion: number;
  teePubkey: string;
  ingestedAt: Date;
}>> {
  return await prisma.event.findMany({
    take: limit,
    orderBy: { eventId: 'desc' },
  });
}
