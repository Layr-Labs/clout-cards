# 4-Player Test Matrix Regression Report
**Date:** After MR-004 Fix  
**Total Tests:** 102  
**Passed:** 93 (91.2%)  
**Failed:** 9 (8.8%)

## Summary

After fixing MR-004 (Progressive Eliminations), the test suite shows **93 passing tests** and **9 failures**. The fix resolved MR-004 by correctly handling the case where only one player remains after a fold - the hand ends immediately without needing a showdown.

## Test Results by Category

### ✅ PRE-FLOP Scenarios: 22/22 Passing (100%)
- **All PRE-FLOP tests passing** ✅
- PF-008 fix remains successful

### ✅ FLOP Scenarios: 10/10 Passing (100%)
- **All FLOP tests passing** ✅
- FL-008 fix remains successful

### ✅ TURN Scenarios: 4/4 Passing (100%)
- **All TURN tests passing** ✅
- TU-004 fix remains successful

### ✅ RIVER Scenarios: 4/4 Passing (100%)
- **All RIVER tests passing** ✅

### ✅ MULTI-WAY TIE Scenarios: 6/6 Passing (100%)
- **All TIE tests passing** ✅
- TI-006 fix remains successful

### ✅ KICKER Scenarios: 4/4 Passing (100%)
- **All KICKER tests passing** ✅
- KI-004 fix remains successful

### ✅ SIDE POT Scenarios: 6/6 Passing (100%)
- **All SIDE POT tests passing** ✅

### ✅ MULTI-ROUND Scenarios: 5/6 Passing (83.3%)
- **MR-001, MR-002, MR-003, MR-004, MR-005** ✅ Passing
- **MR-004: Progressive Eliminations** ✅ **FIXED** - Now correctly checks `foldAction` result and handles hand ending when only one player remains
- **MR-006: All-In on Different Rounds** ❌ Failing - "Cannot call when there is no current bet. Use check instead."

### ❌ EDGE CASES: 6/9 Passing (66.7%)
- **EC-001, EC-002, EC-003, EC-004, EC-007, EC-008** ✅ Passing
- **EC-005: All-In Then Fold** ❌ Failing - Pot amount mismatch (expected 50M, got 53M)
- **EC-006: All-In Then Call** ❌ Failing - `handEnded` expected `true`, got `false` (auto-advance issue)

### ❌ DEALER/BLIND ROTATION Scenarios: 4/7 Passing (57.1%)
- **RO-001, RO-005, RO-006, RO-007** ✅ Passing
- **RO-002, RO-003, RO-004** ❌ Failing - Dealer position not rotating correctly (expected 1/2/3, got 0)

## Recent Fixes

### MR-004: Progressive Eliminations
**Issue:** Test was calling `checkAction` after `foldAction` when only one player remained, expecting a RIVER showdown. However, when only one player remains after a fold, the hand ends immediately (correct poker behavior).

**Fix:** Modified test to check the `foldAction` result. When `foldResult.handEnded === true`, the test verifies the hand ended correctly and skips the `checkAction` call.

**Impact:** Fixed MR-004 (2 test variants). Test now correctly handles the case where only one player remains after a fold.

## Remaining Failures

### 1. MR-006: All-In on Different Rounds (2 failures)
**Error:** `Cannot call when there is no current bet. Use check instead.`
**Likely Cause:** After all-in actions, `currentBet` becomes 0, but test is trying to call. Test should check `currentBet` before calling.

### 2. EC-005: All-In Then Fold (2 failures)
**Error:** Pot amount mismatch - expected 50M, got 53M
**Likely Cause:** Test expectation issue - pot calculation includes blinds (3M) that weren't accounted for in expected value

### 3. EC-006: All-In Then Call (2 failures)
**Error:** `handEnded` expected `true`, got `false`
**Likely Cause:** After all-in and call, players should be marked as `ALL_IN`, triggering auto-advance to RIVER. Similar to PF-008/FL-008 fix needed.

### 4. RO-002, RO-003, RO-004: Dealer Rotation (3 failures)
**Error:** Dealer position not rotating (expected 1/2/3, got 0)
**Likely Cause:** Dealer rotation logic not working correctly - dealer position stays at 0 instead of rotating

## Next Steps

1. **EC-006**: Apply same fix as PF-008/FL-008 - ensure players are marked `ALL_IN` when calling exhausts balance
2. **MR-006**: Add conditional logic to check `currentBet` before calling `callAction`
3. **EC-005**: Review pot calculation and update test expectations
4. **RO-002/003/004**: Investigate dealer rotation logic in `startHand` or `startNewHandIfPossible`

## Test Coverage

- **Total Tests:** 102
- **Passing:** 93 (91.2%)
- **Failing:** 9 (8.8%)
- **Improvement:** +2 tests fixed since last report (MR-004)
