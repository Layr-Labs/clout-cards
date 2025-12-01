# Test Suite

This directory contains integration tests for the poker game logic using Testcontainers and PostgreSQL.

## Setup

The test suite uses:
- **Vitest** - Test runner
- **Testcontainers** - PostgreSQL container management
- **Prisma** - Database access

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui
```

## Test Structure

```
tests/
  setup/
    database.ts      # PostgreSQL container setup/teardown
    fixtures.ts      # Helper functions to create test data
  helpers/
    assertions.ts    # Assertion helpers for verification
  integration/
    allInScenarios.test.ts  # All-in edge case tests
    # ... more test files
```

## How It Works

1. **Before all tests**: A PostgreSQL container is started, migrations are run, and Prisma client is generated
2. **Before each test**: Test data is cleaned up (tables truncated)
3. **During tests**: Service functions are called directly (bypassing API/auth)
4. **After all tests**: Container is stopped and removed

## Writing Tests

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/database';
import { createTestTable, createTestPlayers, ... } from '../setup/fixtures';
import { assertPotAmounts, ... } from '../helpers/assertions';
import { betAction, callAction } from '../../src/services/playerAction';

describe('My Test Suite', () => {
  const prisma = getTestPrisma();
  
  beforeEach(async () => {
    await cleanupTestData(prisma);
  });

  it('should test something', async () => {
    // 1. Setup: Create test data
    const table = await createTestTable(prisma, { ... });
    await createTestPlayers(prisma, table.id, [ ... ]);
    const hand = await createTestHand(prisma, table.id, { deck: ... });
    
    // 2. Execute: Call service functions
    await betAction(table.id, walletAddress, amount);
    
    // 3. Verify: Assert outcomes
    await assertPotAmounts(prisma, hand.id, [ ... ]);
  });
});
```

## Fabricated Decks

Tests use fabricated decks to ensure deterministic outcomes:

```typescript
const deck = createFabricatedDeck([
  // Player 0 hole cards
  { rank: 'A', suit: 'spades' },
  { rank: 'K', suit: 'spades' },
  // Player 1 hole cards
  { rank: 'Q', suit: 'spades' },
  { rank: 'J', suit: 'spades' },
  // Flop
  { rank: '10', suit: 'spades' },
  { rank: '9', suit: 'spades' },
  { rank: '8', suit: 'spades' },
  // ... rest of deck
]);
```

## Test Coverage

Current test coverage includes:
- All-in scenarios (small blind all-in, different amounts, etc.)
- Pot splitting logic
- Hand evaluation
- Betting round progression

More test suites to be added for:
- Hand evaluation edge cases
- Betting actions
- Round progression
- Settlement logic

