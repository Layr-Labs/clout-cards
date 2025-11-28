/**
 * Common validation utilities
 *
 * Provides reusable validation functions for common request parameters
 * and data types used across the API.
 */

import { prisma } from '../db/client';
import { ValidationError, NotFoundError } from './errorHandler';

/**
 * Validates that a table ID parameter is a positive integer
 *
 * @param tableIdParam - Table ID from query params or body (can be string or number)
 * @returns Validated table ID as number
 * @throws {ValidationError} If tableId is missing, invalid, or not a positive integer
 *
 * @example
 * ```typescript
 * const tableId = validateTableId(req.query.tableId);
 * ```
 */
export function validateTableId(tableIdParam: unknown): number {
  if (!tableIdParam) {
    throw new ValidationError('tableId query parameter is required');
  }

  const tableId = parseInt(String(tableIdParam), 10);
  if (isNaN(tableId) || tableId <= 0) {
    throw new ValidationError('tableId must be a positive integer');
  }

  return tableId;
}

/**
 * Validates table ID and verifies table exists in database
 *
 * @param tableIdParam - Table ID from query params or body
 * @returns Validated table ID as number
 * @throws {ValidationError} If tableId is invalid
 * @throws {NotFoundError} If table doesn't exist
 *
 * @example
 * ```typescript
 * const tableId = await validateAndGetTableId(req.query.tableId);
 * ```
 */
export async function validateAndGetTableId(
  tableIdParam: unknown
): Promise<number> {
  const tableId = validateTableId(tableIdParam);

  // Verify table exists
  const table = await prisma.pokerTable.findUnique({
    where: { id: tableId },
    select: { id: true },
  });

  if (!table) {
    throw new NotFoundError(`No table found with id: ${tableId}`);
  }

  return tableId;
}

