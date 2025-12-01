# Pre-Flop Pot Calculation Error Analysis

**Date**: 2025-01-27  
**Scope**: PF-XXX test failures in 4-player test matrix

## Executive Summary

Analyzed 8 failing preflop tests. Found:
- **3 Test Expectation Issues** (FIXED)
- **5 Logic Issues** (DOCUMENTED - Do NOT fix)

## Why Didn't This Show Up in 2-Player Tests?

### Answer: It's NOT Explicit 2-Player Code Paths - It's Natural Game Flow

**Key Finding**: There are **NO explicit 2-player vs 4-player code paths** in the pot splitting logic. The same code runs for both.

**Why 2-Player Tests Don't Hit the Bug:**

1. **`shouldCreateSidePots` requires 2+ players to have acted** (line 155):
   ```typescript
   if (playersWhoHaveActed.length < 2) {
     return false; // Not enough players have acted yet
   }
   ```

2. **In 2-player games:**
   - When side pots are needed, **both players must have acted** (because `playersWhoHaveActed.length >= 2` is required)
   - By the time `shouldCreateSidePots` returns `true`, both players have acted
   - This naturally happens **at or near round completion**
   - At round completion, all actions are processed correctly, including folded players' POST_BLIND

3. **In 4-player games:**
   - When side pots are needed, **only 2+ players need to have acted** (not all 4)
   - `updatePotsIfNeeded` is called after **every action** (line 1099 in `createActionAndEvent`)
   - This can trigger `createSidePots` **mid-round** when:
     - 2+ players have acted (side pots needed)
     - But other players have folded (their POST_BLIND is included in `totalChipsCommitted`)
     - The folded small blind's 1M POST_BLIND is not allocated to side pots because only `activePlayers` are considered

**The Bug Flow:**

1. **4-Player Scenario (PF-007):**
   - UTG raises → `updatePotsIfNeeded` called → no side pots yet (only 1 player acted)
   - Dealer folds → `updatePotsIfNeeded` called → no side pots yet (only 1 player acted)
   - Small blind folds → `updatePotsIfNeeded` called → no side pots yet (only 1 player acted)
   - Big blind raises → `updatePotsIfNeeded` called → **NOW side pots needed** (2 players acted: UTG + BB)
   - **BUG**: `createSidePots` is called mid-round with:
     - `totalChipsCommitted` includes folded small blind's 1M POST_BLIND ✅
     - But side pots only consider `activePlayers` (UTG + BB) ❌
     - Result: 1M missing from side pots

2. **2-Player Scenario (PF-011):**
   - Small blind all-in → `updatePotsIfNeeded` called → no side pots yet (only 1 player acted)
   - Big blind all-in → `updatePotsIfNeeded` called → **NOW side pots needed** (2 players acted)
   - **NO BUG**: Both players are active (neither folded), so all chips are allocated correctly

**Conclusion**: It's **NOT redundant or error-prone 2-player code paths**. It's the **natural flow** of 2-player games that avoids the bug:
- 2-player games naturally require both players to act before side pots are created
- This happens at round completion, where all actions are processed correctly
- 4-player games can create side pots mid-round when only some players have acted, exposing the bug

## Detailed Analysis

### Category 1: Rake Calculation Issues (TEST EXPECTATION - FIXED ✅)

**Tests**: PF-001 (700 bps rake), PF-002 (700 bps rake)

**Error**: Expected 3000000n, got 3225806n

**Root Cause**: 
- `verifyPotWithRake` was incorrectly assuming pots contain AFTER-RAKE amounts when `rakeBps > 0`
- **Reality**: Rake is only deducted at settlement (`hand.status === 'COMPLETED'`)
- During the hand, `pot.amount` contains BEFORE-RAKE amounts
- The function was reverse-calculating: `beforeRake = afterRake * 10000 / (10000 - 700)`
- But since pots contain before-rake amounts, it was incorrectly inflating the value

**Fix Applied**:
- Updated `verifyPotWithRake` to check `hand.status`
- If `status === 'COMPLETED'`: pots contain after-rake amounts (reverse-calculate)
- If `status !== 'COMPLETED'`: pots contain before-rake amounts (use directly)

**Status**: ✅ FIXED

---

### Category 2: Pot Amount Mismatch (TEST EXPECTATION - FIXED ✅)

**Test**: PF-009: All-In Pre-Flop (Two Players, Same Amount)

**Error**: Expected 103000000n, got 101000000n (missing 2M)

**Root Cause**: Test expectation was double-counting the big blind POST_BLIND
- Test expected: 1M (SB) + 2M (BB) + 50M (UTG) + 50M (BB) = 103M
- **Problem**: The big blind's 2M POST_BLIND is already included in their 50M total commitment
- Correct calculation:
  - Small blind: 1M (POST_BLIND, folded but chips stay)
  - Big blind: 2M (POST_BLIND) + 48M (ALL_IN incremental) = 50M total
  - UTG: 50M (ALL_IN total)
  - **Total: 1M + 50M + 50M = 101M**

**Fix Applied**: Updated test expectation from 103M to 101M

**Status**: ✅ FIXED

---

### Category 3: Side Pot Creation Missing Small Blind (LOGIC ISSUE - DO NOT FIX ⚠️)

**Tests**: PF-007, PF-010, PF-011, PF-014

**Error Pattern**: All show pots are exactly 1M less than committed chips
- PF-007: pots=15M, committed=16M (missing 1M)
- PF-010: pots=80M, committed=81M (missing 1M)
- PF-011: pots=100M, committed=101M (missing 1M)
- PF-014: pots=21M, committed=22M (missing 1M)

**Root Cause**: Logic issue in `createSidePots` function when called mid-round
- When `createSidePots` is called during a betting round (via `updatePotsIfNeeded`), it includes folded players' POST_BLIND in `totalChipsCommitted`
- But when calculating side pots, only `activePlayers` are considered for eligibility
- The folded small blind's 1M POST_BLIND is included in `totalChipsCommitted` but not properly allocated to side pots
- **Location**: `src/services/potSplitting.ts:createSidePots` (lines 297-336)

**The Bug Details**:
1. Line 262-278: Processes ALL actions (including folded players' POST_BLIND) → builds `playerTotals` with all players
2. Line 298-301: Calculates `totalChipsCommitted` from ALL `playerTotals.values()` (includes folded players) ✅ Correct
3. Line 312-336: Creates side pots using only `activePlayers` for eligibility ❌ Problem
4. The pot calculation `(level - previous_level) * number_of_eligible_players` only counts active players
5. Result: Folded small blind's 1M is in `totalChipsCommitted` but not allocated to any side pot

**Why 2-Player Tests Don't Hit This**:
- `shouldCreateSidePots` requires `playersWhoHaveActed.length >= 2`
- In 2-player games, this means **both players must have acted** before side pots are created
- This naturally happens at round completion, where all actions are processed correctly
- Even if a player folds, their POST_BLIND is included because the round is complete

**Why 4-Player Tests Hit This**:
- `shouldCreateSidePots` requires `playersWhoHaveActed.length >= 2` (not all 4)
- `updatePotsIfNeeded` is called after **every action** (for UI display)
- This can trigger `createSidePots` **mid-round** when:
  - 2+ players have acted (side pots needed)
  - But other players have folded (their POST_BLIND is included in `totalChipsCommitted`)
  - The folded small blind's 1M POST_BLIND is not allocated to side pots because only `activePlayers` are considered

**Category**: Same root cause - all involve side pot creation during betting rounds where folded small blind amount is missing

**Recommendation**: Fix `createSidePots` to properly allocate folded players' chips to side pots, or ensure folded players' POST_BLIND is included in the side pot calculation

**Status**: ⚠️ LOGIC ISSUE - DO NOT FIX (Documented only)

---

### Category 4: Hand Not Ending When All Active Players All-In (LOGIC ISSUE - DO NOT FIX ⚠️)

**Test**: PF-008: All-In Pre-Flop (Single Player)

**Error**: Expected `handEnded=true`, got `false`

**Scenario**:
1. UTG all-in (50M total)
2. Dealer calls (50M to match UTG)
3. Small blind folds
4. Big blind calls (50M to match UTG)
5. **Expected**: After big blind calls, all remaining active players (UTG, Dealer, Big Blind) are all-in, so hand should auto-advance to RIVER and settle
6. **Actual**: Hand does not end, `handEnded=false`

**Root Cause**: Auto-advancement logic not triggering
- The `checkAndHandleAllPlayersAllIn` function should detect when all active players are all-in
- Or `checkAndHandleOnlyOneActivePlayer` should trigger auto-advancement
- Condition `activePlayers.length === 0 && allInPlayers.length >= 2` should be met
- But the hand is not being detected as ready for auto-advancement

**Location**: `src/services/playerAction.ts`
- `checkAndHandleAllPlayersAllIn` (line ~2516)
- `checkAndHandleOnlyOneActivePlayer` (line ~2541)
- `advanceToRiverIfOnlyOneActivePlayer` (line ~547)

**Analysis**:
- After big blind calls, all remaining players should be ALL_IN status
- The auto-advancement logic should detect this and advance to RIVER
- Then settle the hand via showdown

**Category**: Different root cause from pot calculation issues

**Recommendation**: Investigate why auto-advancement logic isn't triggering when all active players are all-in

**Status**: ⚠️ LOGIC ISSUE - DO NOT FIX (Documented only)

---

## Summary Table

| Test | Issue Type | Root Cause | Status |
|------|-----------|------------|--------|
| PF-001 (700 bps) | Test Expectation | verifyPotWithRake assuming after-rake during hand | ✅ FIXED |
| PF-002 (700 bps) | Test Expectation | verifyPotWithRake assuming after-rake during hand | ✅ FIXED |
| PF-007 | Logic Issue | Side pot creation missing 1M (folded small blind) | ⚠️ DOCUMENTED |
| PF-008 | Logic Issue | Auto-advancement not triggering | ⚠️ DOCUMENTED |
| PF-009 | Test Expectation | Double-counting big blind POST_BLIND | ✅ FIXED |
| PF-010 | Logic Issue | Side pot creation missing 1M (folded small blind) | ⚠️ DOCUMENTED |
| PF-011 | Logic Issue | Side pot creation missing 1M (folded small blind) | ⚠️ DOCUMENTED |
| PF-014 | Logic Issue | Side pot creation missing 1M (folded small blind) | ⚠️ DOCUMENTED |

## Test Results After Fixes

- ✅ PF-001 (700 bps rake): FIXED
- ✅ PF-002 (700 bps rake): FIXED  
- ✅ PF-009: FIXED
- ❌ PF-007: Logic issue - pot mismatch (pots=15M, committed=16M)
- ❌ PF-008: Logic issue - hand not ending when all active players all-in
- ❌ PF-010: Logic issue - pot mismatch (pots=80M, committed=81M)
- ❌ PF-011: Logic issue - pot mismatch (pots=100M, committed=101M)
- ❌ PF-014: Logic issue - pot mismatch (pots=21M, committed=22M)

## Recommendations for Logic Issues

### Issue 1: Side Pot Creation Missing Folded Small Blind
**File**: `src/services/potSplitting.ts:createSidePots`
**Investigation Points**:
1. When `createSidePots` is called mid-round, folded players' POST_BLIND is included in `totalChipsCommitted` but not allocated to side pots
2. The side pot calculation only considers `activePlayers` for eligibility, but should also account for folded players' chips
3. Fix: Either include folded players in the side pot calculation, or ensure their chips are allocated to the lowest side pot

### Issue 2: Auto-Advancement Not Triggering
**File**: `src/services/playerAction.ts`
**Investigation Points**:
1. Verify `checkAndHandleAllPlayersAllIn` is being called after actions
2. Check if player statuses are correctly set to ALL_IN
3. Verify the condition `activePlayers.length === 0 && allInPlayers.length >= 2` is being evaluated correctly
