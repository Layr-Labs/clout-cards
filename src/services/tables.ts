/**
 * Table management service
 *
 * Provides functions for creating and managing poker tables.
 */

import { prisma } from '../db/client';
import { createEventInTransaction, EventKind } from '../db/events';

/**
 * Input for creating a new poker table
 */
export interface CreateTableInput {
  name: string;
  minimumBuyIn: bigint;
  maximumBuyIn: bigint;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  actionTimeoutSeconds?: number | null; // Action timeout in seconds (null or 0 = use default 30s)
  isActive?: boolean;
}

/**
 * Creates a new poker table and logs it as an event in a single transaction
 *
 * @param input - Table creation parameters
 * @param adminAddress - Address of the admin creating the table
 * @returns The created table record
 * @throws {Error} If table creation fails or validation fails
 */
export async function createTable(
  input: CreateTableInput,
  adminAddress: string
): Promise<{
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
}> {
  // Validate input matches database constraints
  if (input.perHandRake < 0) {
    throw new Error('perHandRake must be >= 0');
  }
  if (input.maxSeatCount < 0 || input.maxSeatCount > 8) {
    throw new Error('maxSeatCount must be between 0 and 8');
  }
  if (input.maximumBuyIn < input.minimumBuyIn) {
    throw new Error('maximumBuyIn must be >= minimumBuyIn');
  }
  if (input.minimumBuyIn <= 0n) {
    throw new Error('minimumBuyIn must be > 0');
  }
  if (input.bigBlind < input.smallBlind) {
    throw new Error('bigBlind must be >= smallBlind');
  }
  if (input.smallBlind <= 0n) {
    throw new Error('smallBlind must be > 0');
  }
  if (input.bigBlind <= 0n) {
    throw new Error('bigBlind must be > 0');
  }

  // Create canonical JSON payload for event
  const payload = {
    kind: 'create_table',
    admin: adminAddress,
    table: {
      name: input.name,
      minimumBuyIn: input.minimumBuyIn.toString(),
      maximumBuyIn: input.maximumBuyIn.toString(),
      perHandRake: input.perHandRake,
      maxSeatCount: input.maxSeatCount,
      smallBlind: input.smallBlind.toString(),
      bigBlind: input.bigBlind.toString(),
      actionTimeoutSeconds: input.actionTimeoutSeconds ?? null,
      isActive: input.isActive ?? true,
    },
  };
  const payloadJson = JSON.stringify(payload);

  // Use transaction to ensure both table creation and event logging succeed
  return await prisma.$transaction(async (tx) => {
    // Create the table
    const table = await tx.pokerTable.create({
      data: {
        name: input.name,
        minimumBuyIn: input.minimumBuyIn,
        maximumBuyIn: input.maximumBuyIn,
        perHandRake: input.perHandRake,
        maxSeatCount: input.maxSeatCount,
        smallBlind: input.smallBlind,
        bigBlind: input.bigBlind,
        actionTimeoutSeconds: input.actionTimeoutSeconds ?? null,
        isActive: input.isActive ?? true,
      },
    });

    // Create the event using transaction context
    await createEventInTransaction(tx, EventKind.CREATE_TABLE, payloadJson, adminAddress, null);

    return table;
  });
}

/**
 * Gets all poker tables from the database
 *
 * @returns Array of all poker tables
 * @throws {Error} If query fails
 */
export async function getAllTables(): Promise<Array<{
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
}>> {
  return await prisma.pokerTable.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}

