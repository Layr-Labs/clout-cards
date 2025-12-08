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
 * @returns Array of all poker tables including handStartDelaySeconds
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
  handStartDelaySeconds: number | null;
}>> {
  return await prisma.pokerTable.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Result of updating table active status
 */
export interface UpdateTableActiveStatusResult {
  id: number;
  name: string;
  isActive: boolean;
  updatedAt: Date;
}

/**
 * Updates a table's active status (activate or deactivate)
 *
 * This function:
 * 1. Validates the table exists
 * 2. Updates the isActive field
 * 3. Creates a TEE-signed event (TABLE_ACTIVATED or TABLE_DEACTIVATED)
 *
 * When a table is deactivated:
 * - Existing hands can complete normally
 * - No new hands will start (handStartChecker checks isActive)
 * - Players cannot join (joinTable uses validateTableExistsAndActive)
 * - Chat is disabled (chat route checks isActive)
 * - Players can still stand up to recover funds
 *
 * @param tableId - ID of the table to update
 * @param isActive - New active status (true = activate, false = deactivate)
 * @param adminAddress - Address of the admin making the change
 * @returns Updated table record with id, name, isActive, and updatedAt
 * @throws {Error} If table not found or transaction fails
 */
export async function updateTableActiveStatus(
  tableId: number,
  isActive: boolean,
  adminAddress: string
): Promise<UpdateTableActiveStatusResult> {
  return await prisma.$transaction(async (tx) => {
    // 1. Find the table
    const table = await tx.pokerTable.findUnique({
      where: { id: tableId },
      select: { id: true, name: true, isActive: true },
    });

    if (!table) {
      throw new Error(`Table with id ${tableId} not found`);
    }

    // 2. Check if status is actually changing
    if (table.isActive === isActive) {
      throw new Error(`Table ${table.name} is already ${isActive ? 'active' : 'inactive'}`);
    }

    // 3. Update the table status
    const updatedTable = await tx.pokerTable.update({
      where: { id: tableId },
      data: { isActive },
      select: { id: true, name: true, isActive: true, updatedAt: true },
    });

    // 4. Create the event payload
    const eventKind = isActive ? EventKind.TABLE_ACTIVATED : EventKind.TABLE_DEACTIVATED;
    const payload = {
      kind: isActive ? 'table_activated' : 'table_deactivated',
      admin: adminAddress,
      table: {
        id: table.id,
        name: table.name,
      },
      timestamp: new Date().toISOString(),
    };
    const payloadJson = JSON.stringify(payload);

    // 5. Create the TEE-signed event
    await createEventInTransaction(tx, eventKind, payloadJson, adminAddress, null);

    return updatedTable;
  });
}

