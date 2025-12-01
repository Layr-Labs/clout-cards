/**
 * Assertion helpers for test verification
 *
 * Provides convenient assertion functions for checking
 * pot amounts, winners, hand evaluations, etc.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Asserts that pot amounts match expected values
 *
 * @param prisma - Prisma client instance
 * @param handId - Hand ID
 * @param expectedPots - Array of expected pot amounts
 */
export async function assertPotAmounts(
  prismaClient: PrismaClient,
  handId: number,
  expectedPots: Array<{ potNumber: number; amount: bigint }>
) {
  const pots = await (prismaClient as any).pot.findMany({
    where: { handId },
    orderBy: { potNumber: 'asc' },
  });

  if (pots.length !== expectedPots.length) {
    throw new Error(
      `Expected ${expectedPots.length} pots, got ${pots.length}`
    );
  }

  for (let i = 0; i < expectedPots.length; i++) {
    const expected = expectedPots[i];
    const actual = pots[i];

    if (actual.potNumber !== expected.potNumber) {
      throw new Error(
        `Pot ${i}: Expected potNumber ${expected.potNumber}, got ${actual.potNumber}`
      );
    }

    if (BigInt(actual.amount) !== expected.amount) {
      throw new Error(
        `Pot ${i}: Expected amount ${expected.amount}, got ${actual.amount}`
      );
    }
  }
}

/**
 * Asserts that winners match expected seat numbers
 *
 * @param prisma - Prisma client instance
 * @param handId - Hand ID
 * @param expectedWinners - Map of potNumber -> winner seat numbers
 */
export async function assertPotWinners(
  prismaClient: PrismaClient,
  handId: number,
  expectedWinners: Map<number, number[]>
) {
  const pots = await (prismaClient as any).pot.findMany({
    where: { handId },
    orderBy: { potNumber: 'asc' },
  });

  for (const pot of pots) {
    const expected = expectedWinners.get(pot.potNumber) || [];
    const actual = Array.isArray(pot.winnerSeatNumbers)
      ? pot.winnerSeatNumbers
      : [];

    if (actual.length !== expected.length) {
      throw new Error(
        `Pot ${pot.potNumber}: Expected ${expected.length} winners, got ${actual.length}`
      );
    }

    const actualSorted = [...actual].sort((a, b) => a - b);
    const expectedSorted = [...expected].sort((a, b) => a - b);

    for (let i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) {
        throw new Error(
          `Pot ${pot.potNumber}: Expected winners [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`
        );
      }
    }
  }
}

/**
 * Asserts that player balances match expected values
 *
 * @param prisma - Prisma client instance
 * @param tableId - Table ID
 * @param expectedBalances - Map of seatNumber -> expected balance
 */
export async function assertPlayerBalances(
  prismaClient: PrismaClient,
  tableId: number,
  expectedBalances: Map<number, bigint>
) {
  const sessions = await prismaClient.tableSeatSession.findMany({
    where: { tableId, isActive: true },
  });

  for (const session of sessions) {
    const expected = expectedBalances.get(session.seatNumber);
    if (expected === undefined) {
      continue; // Skip if not in expected map
    }

    const actual = BigInt(session.tableBalanceGwei);
    if (actual !== expected) {
      throw new Error(
        `Seat ${session.seatNumber}: Expected balance ${expected}, got ${actual}`
      );
    }
  }
}

/**
 * Asserts that hand status matches expected value
 *
 * @param prisma - Prisma client instance
 * @param handId - Hand ID
 * @param expectedStatus - Expected hand status
 */
export async function assertHandStatus(
  prismaClient: PrismaClient,
  handId: number,
  expectedStatus: 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETED'
) {
  const hand = await (prismaClient as any).hand.findUnique({
    where: { id: handId },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found`);
  }

  if (hand.status !== expectedStatus) {
    throw new Error(
      `Expected hand status ${expectedStatus}, got ${hand.status}`
    );
  }
}

/**
 * Asserts that hand round matches expected value
 *
 * @param prisma - Prisma client instance
 * @param handId - Hand ID
 * @param expectedRound - Expected betting round
 */
export async function assertHandRound(
  prismaClient: PrismaClient,
  handId: number,
  expectedRound: 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER'
) {
  const hand = await (prismaClient as any).hand.findUnique({
    where: { id: handId },
  });

  if (!hand) {
    throw new Error(`Hand ${handId} not found`);
  }

  if (hand.round !== expectedRound) {
    throw new Error(
      `Expected hand round ${expectedRound}, got ${hand.round}`
    );
  }
}

