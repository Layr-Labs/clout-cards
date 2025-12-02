# 4-Player Test Matrix Regression Report
**Date:** After TU-004 Fix  
**Total Tests:** 102  
**Passed:** 82 (80.4%)  
**Failed:** 20 (19.6%)

## Summary

After fixing TU-004 (All-In on Turn), the test suite shows **82 passing tests** and **20 failures**. TU-004 is now passing, improving from 80 to 82 passing tests.

## Test Results by Category

### ✅ PRE-FLOP Scenarios: 22/22 Passing (100%)
- **All PRE-FLOP tests passing** ✅
- PF-008 fix remains successful

### ✅ FLOP Scenarios: 10/10 Passing (100%)
- **All FLOP tests passing** ✅
- FL-008 fix remains successful

### ✅ TURN Scenarios: 4/4 Passing (100%)
- **All TURN tests passing** ✅
- **TU-004 fix was successful** - Test now correctly starts on TURN and creates side pots

### ✅ RIVER Scenarios: 4/4 Passing (100%)
- **All RIVER tests passing** ✅

### ❌ MULTI-WAY TIE Scenarios: 2/6 Passing (33.3%)
- **TI-001, TI-002, TI-003, TI-006** - ❌ FAILING (4 tests)
  - **Issue:** `Error: Expected 5 community cards, got 10`
  - **Root Cause:** Test setup is incorrectly setting `communityCards` array - appears to be duplicating cards or not properly slicing the deck
  - **Fix Needed:** Fix test setup in `setupStandardFourPlayerTest` or test-specific deck configuration for tie scenarios

### ❌ KICKER Scenarios: 0/4 Passing (0%)
- **KI-001, KI-002, KI-003, KI-004** - ❌ FAILING (4 tests)
  - **Issue:** `Error: Expected 5 community cards, got 10`
  - **Root Cause:** Same as MULTI-WAY TIE - test setup issue with community cards
  - **Fix Needed:** Same fix as MULTI-WAY TIE scenarios

### ✅ SIDE POT Scenarios: 6/6 Passing (100%)
- **All SIDE POT tests passing** ✅

### ✅ MULTI-ROUND Scenarios: 3/6 Passing (50%)
- **MR-004: Progressive Eliminations** - ❌ FAILING (2 variants)
  - **Issue:** `Error: No active hand found for table`
  - **Root Cause:** Hand is ending prematurely or test is trying to act after hand completion
  - **Fix Needed:** Review test logic - may need to check hand status before attempting actions

- **MR-006: All-In on Different Rounds** - ❌ FAILING (2 variants)
  - **Issue:** `Error: Cannot call when there is no current bet. Use check instead.`
  - **Root Cause:** Test is calling `callAction` when `currentBet` is `0n` (round advanced or all-in cleared the bet)
  - **Fix Needed:** Add conditional logic to check `currentBet` before calling `callAction` (similar to previous fixes)

### ✅ EDGE CASES: 4/8 Passing (50%)
- **EC-005: All-In Then Fold** - ❌ FAILING (2 variants)
  - **Issue:** Pot amount mismatch - expected `50000000n` but got `53000000n`
  - **Root Cause:** Test expectation may be incorrect, or pot calculation includes extra chips (possibly blinds)
  - **Fix Needed:** Review pot calculation logic or update test expectation

- **EC-006: All-In Then Call** - ❌ FAILING (2 variants)
  - **Issue:** `handEnded` expected `true` but got `false`
  - **Root Cause:** Similar to PF-008 and FL-008 - all-in scenarios not properly ending the hand
  - **Fix Needed:** Apply same fix pattern as PF-008/FL-008 - use `allInAction` when calling exhausts balance

- **EC-008: Kicker Edge Cases** - ❌ FAILING
  - **Issue:** `Error: Expected 5 community cards, got 10`
  - **Root Cause:** Same as MULTI-WAY TIE and KICKER scenarios
  - **Fix Needed:** Same fix as MULTI-WAY TIE scenarios

### ❌ DEALER/BLIND ROTATION Scenarios: 4/7 Passing (57.1%)
- **RO-002, RO-003, RO-004** - ❌ FAILING (3 tests)
  - **Issue:** Dealer position not rotating - expected `1, 2, 3` but got `0` for all
  - **Root Cause:** `startNewHandIfPossible` or hand rotation logic not properly advancing dealer position
  - **Fix Needed:** Review dealer rotation logic in `startNewHandIfPossible` or `startHand`

## Failure Patterns

### Pattern 1: Community Cards Array Issue (9 failures)
- **Affected Tests:** TI-001, TI-002, TI-003, TI-006, KI-001, KI-002, KI-003, KI-004, EC-008
- **Error:** `Expected 5 community cards, got 10`
- **Likely Cause:** Test setup incorrectly populating `communityCards` array (possibly duplicating or not slicing correctly)
- **Priority:** Medium - Test setup issue, not core logic

### Pattern 2: All-In Hand Ending (2 failures)
- **Affected Tests:** EC-006
- **Error:** `handEnded` expected `true` but got `false`
- **Likely Cause:** Players going all-in not being marked as `ALL_IN` when calling exhausts balance (same issue as PF-008/FL-008)
- **Priority:** High - Core game logic issue, can apply PF-008/FL-008 fix pattern

### Pattern 3: Dealer Rotation (3 failures)
- **Affected Tests:** RO-002, RO-003, RO-004
- **Error:** Dealer position not advancing between hands
- **Likely Cause:** `startNewHandIfPossible` or `startHand` not properly rotating dealer
- **Priority:** Medium - Feature functionality issue

### Pattern 4: Test Logic Issues (6 failures)
- **Affected Tests:** MR-004 (hand not found), MR-006 (call when no bet), EC-005 (pot amount)
- **Likely Cause:** Test expectations or test logic issues
- **Priority:** Low-Medium - May be test issues rather than code issues

## Improvements Since Last Report

1. ✅ **TU-004 Fixed:** All-In on Turn test now passing (was failing before)
2. ✅ **Overall Pass Rate Improved:** 80.4% (82/102) vs 78.4% (80/102) previously
3. ✅ **All TURN tests passing:** 4/4 (100%)

## Recommendations

1. **High Priority:** Fix EC-006 all-in hand ending issue - apply PF-008/FL-008 fix pattern
2. **Medium Priority:** Fix community cards array issue in test setup (affects 9 tests)
3. **Medium Priority:** Fix dealer rotation logic (affects 3 tests)
4. **Low-Medium Priority:** Review and fix test logic issues (MR-004, MR-006, EC-005)

## Next Steps

1. Apply PF-008/FL-008 fix pattern to EC-006
2. Investigate community cards array duplication in test setup
3. Review dealer rotation logic in `startNewHandIfPossible`
4. Review test expectations for MR-004, MR-006, EC-005
