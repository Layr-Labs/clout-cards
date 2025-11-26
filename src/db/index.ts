/**
 * Database module exports
 *
 * This module re-exports all database-related functionality for convenient importing.
 */

export { prisma, disconnectDatabase } from './client';
export { createEvent, withEvent, getLatestEventId, EventKind } from './events';
export {
  computePayloadDigest,
  signPayload,
  getTeePublicKey,
} from './eip712';
