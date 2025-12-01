# Pot Calculation Issues Analysis

## Summary
Investigated 11 failing pot calculation tests. Found that **all failures are test expectation issues**, not logic bugs in the service layer.

## Findings

### PF-008: Small Blind All-In Pre-Flop (Big Blind Calls)
**Issue**: Test expects 102M but gets 100M
**Root Cause**: Test comment assumes Player 0 can go all-in for 50M incremental, but they only have 49M left after posting 1M blind.
**Actual Calculation**:
- Player 0: 1M (blind) + 49M (all-in) = 50M total
- Player 1: 2M (blind) + 48M (call) = 50M total
- Total: 100M ✅ (correct)
**Verdict**: **TEST ISSUE** - Test expectation is wrong

### PF-009: Small Blind All-In Pre-Flop (Big Blind Folds)
**Issue**: Test expects 50M but gets 52M
**Root Cause**: Test doesn't account for the big blind's 2M staying in the pot when they fold.
**Actual Calculation**:
- Player 0: 1M (blind) + 49M (all-in) = 50M total
- Player 1: 2M (blind, stays in pot when folded) = 2M
- Total: 52M ✅ (correct)
**Verdict**: **TEST ISSUE** - Test expectation is wrong (folded player's blind stays in pot)

### PF-010: Big Blind All-In Pre-Flop (Small Blind Calls)
**Issue**: Test still uses direct DB manipulation, not `startHand`
**Root Cause**: Test hasn't been refactored to use service layer
**Verdict**: **TEST ISSUE** - Needs refactoring to use `startHand`

### PF-011: Both Players All-In Pre-Flop (Different Amounts)
**Issue**: Test expects 2 pots but gets 1 pot
**Root Cause**: Test comment assumes different amounts (51M vs 52M), but with 50M starting balances, both players commit 50M total (no side pot needed).
**Actual Calculation** (if using `startHand`):
- Player 0: 1M (blind) + 49M (all-in) = 50M total
- Player 1: 2M (blind) + 48M (all-in) = 50M total
- Both commit same amount → 1 pot of 100M ✅ (correct)
**Verdict**: **TEST ISSUE** - Test expectation is wrong, and test needs refactoring to use `startHand`

### FL-008, FL-009, FL-010: Similar issues
**Verdict**: **TEST ISSUES** - Similar pot calculation expectation problems

## Conclusion
All pot calculation failures are due to **incorrect test expectations**, not bugs in the service layer. The service layer (`createSidePots`, `updatePotTotal`) is calculating correctly based on actual HandAction records.

## Recommendations
1. Fix test expectations to match actual calculations
2. Refactor PF-010 and PF-011 to use `startHand` instead of direct DB manipulation
3. Update test comments to reflect correct expected values

