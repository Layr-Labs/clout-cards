/**
 * Table validation utilities
 *
 * Provides reusable functions for validating tables and finding active hands
 * across different services. Ensures consistent validation logic.
 */

/**
 * Validates that a table exists and is active
 *
 * @param tableId - Table ID to validate
 * @param tx - Prisma transaction client (or prisma client)
 * @returns Validated table object
 * @throws {Error} If table not found or not active
 */
export async function validateTableExistsAndActive(
  tableId: number,
  tx: any
): Promise<any> {
  const table = await tx.pokerTable.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw new Error(`Table with id ${tableId} not found`);
  }

  if (!table.isActive) {
    throw new Error(`Table ${table.name} is not active`);
  }

  return table;
}

/**
 * Finds an active hand for a table (status not COMPLETED)
 *
 * @param tableId - Table ID
 * @param tx - Prisma transaction client (or prisma client)
 * @param includePots - Whether to include pots in the query (default: false)
 * @returns Active hand object, or null if none found
 */
export async function findActiveHand(
  tableId: number,
  tx: any,
  includePots: boolean = false
): Promise<any | null> {
  return await (tx as any).hand.findFirst({
    where: {
      tableId,
      status: {
        not: 'COMPLETED',
      },
    },
    include: {
      players: true,
      ...(includePots ? { pots: true } : {}),
    },
  });
}

