/**
 * Test to verify test infrastructure is working
 *
 * This is a simple smoke test to ensure:
 * - PostgreSQL container starts correctly
 * - Database connection works
 * - Prisma migrations ran successfully
 * - Basic database operations work
 */

import { describe, it, expect } from 'vitest';
import { getTestPrisma } from '../setup/database';
import {
  createTestTable,
  cleanupTestData,
} from '../setup/fixtures';

describe('Test Infrastructure', () => {
  it('should connect to test database', async () => {
    const prisma = getTestPrisma();
    // Simple connection test
    await prisma.$queryRaw`SELECT 1`;
    expect(true).toBe(true);
  });

  it('should create and query test table', async () => {
    const prisma = getTestPrisma();
    await cleanupTestData(prisma);
    
    const table = await createTestTable(prisma, {
      name: 'Test Table',
      bigBlind: 2000000n,
    });

    expect(table).toBeDefined();
    expect(table.id).toBeGreaterThan(0);
    expect(table.name).toBe('Test Table');
    expect(BigInt(table.bigBlind)).toBe(2000000n);

    // Verify we can query it back
    const found = await prisma.pokerTable.findUnique({
      where: { id: table.id },
    });

    expect(found).toBeDefined();
    expect(found?.id).toBe(table.id);
  });

  it('should have all required tables', async () => {
    const prisma = getTestPrisma();
    // Verify Prisma schema tables exist by trying to query them
    await prisma.pokerTable.findMany();
    await prisma.tableSeatSession.findMany();
    await (prisma as any).hand.findMany();
    await (prisma as any).handPlayer.findMany();
    await (prisma as any).pot.findMany();
    await (prisma as any).handAction.findMany();
    await prisma.event.findMany();
    
    expect(true).toBe(true); // If we get here, all tables exist
  });
});

