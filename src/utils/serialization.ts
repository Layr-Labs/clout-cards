/**
 * Utilities for serializing BigInt values in API responses
 *
 * Provides functions to convert database models with BigInt fields
 * to JSON-safe objects for API responses, and parse BigInt strings
 * from request bodies.
 */

/**
 * Converts a table object with BigInt fields to a JSON-safe object
 *
 * @param table - Table object from database with BigInt fields
 * @returns JSON-safe table object with BigInt fields as strings
 */
export function serializeTable(table: {
  id: number;
  name: string;
  minimumBuyIn: bigint;
  maximumBuyIn: bigint;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: table.id,
    name: table.name,
    minimumBuyIn: table.minimumBuyIn.toString(),
    maximumBuyIn: table.maximumBuyIn.toString(),
    perHandRake: table.perHandRake,
    maxSeatCount: table.maxSeatCount,
    smallBlind: table.smallBlind.toString(),
    bigBlind: table.bigBlind.toString(),
    isActive: table.isActive,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

/**
 * Converts a table seat session with BigInt fields to a JSON-safe object
 *
 * @param session - Session object from database with BigInt fields
 * @returns JSON-safe session object with BigInt fields as strings
 */
export function serializeTableSeatSession(session: {
  id: number;
  walletAddress: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  seatNumber: number;
  joinedAt: Date;
  leftAt: Date | null;
  isActive: boolean;
  tableBalanceGwei: bigint;
}) {
  return {
    id: session.id,
    walletAddress: session.walletAddress,
    twitterHandle: session.twitterHandle,
    twitterAvatarUrl: session.twitterAvatarUrl,
    seatNumber: session.seatNumber,
    joinedAt: session.joinedAt.toISOString(),
    leftAt: session.leftAt?.toISOString() || null,
    isActive: session.isActive,
    tableBalanceGwei: session.tableBalanceGwei.toString(),
  };
}

/**
 * Parses table input with BigInt string fields to CreateTableInput format
 *
 * Converts string representations of BigInt values to actual BigInt values
 * for database operations.
 *
 * @param input - Table input with BigInt fields as strings
 * @returns Table input with BigInt fields as BigInt values
 */
export function parseTableInput(input: {
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive?: boolean;
}): {
  name: string;
  minimumBuyIn: bigint;
  maximumBuyIn: bigint;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  isActive?: boolean;
} {
  return {
    name: input.name,
    minimumBuyIn: BigInt(input.minimumBuyIn),
    maximumBuyIn: BigInt(input.maximumBuyIn),
    perHandRake: input.perHandRake,
    maxSeatCount: input.maxSeatCount,
    smallBlind: BigInt(input.smallBlind),
    bigBlind: BigInt(input.bigBlind),
    isActive: input.isActive,
  };
}

