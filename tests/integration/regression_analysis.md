# Regression Test Analysis

**Date:** Current  
**Test Run:** Full regression on 2-player and 4-player test matrices

## 2-Player Test Matrix Results

**Status:** ✅ **ALL PASSING**  
**Total Tests:** 43  
**Passed:** 43 (100%)  
**Failed:** 0

### Summary

All 2-player tests are passing after the recent fixes:
- ✅ Round advancement logic working correctly
- ✅ Pot calculations accurate
- ✅ All-in scenarios handled properly
- ✅ Side pot creation working
- ✅ Showdown and settlement functioning

### Key Fixes Applied

1. **Round Advancement**: Fixed wrap-around detection for zero-bet scenarios
2. **Pot Calculations**: Corrected test expectations for chipsCommitted reset behavior
3. **Turn Order**: Fixed `currentActionSeat` assignment after round completion

---

## 4-Player Test Matrix Results

**Status:** ⚠️ **PARTIAL PASS**  
**Total Tests:** 102  
**Passed:** 66 (64.7%)  
**Failed:** 36 (35.3%)

### Failure Categories

#### 1. Round Advancement Issues (3 failures)
- **TU-001**: All Players Check on Turn
  - Expected: `roundAdvanced = true`
  - Actual: `roundAdvanced = false`
  - Issue: Round not advancing from TURN to RIVER when all players check

#### 2. All-In / Hand Completion Issues (4 failures)
- **PF-008**: All-In Pre-Flop (Single Player) - 2 variants
  - Expected: `handEnded = true`
  - Actual: `handEnded = false`
  - Issue: Hand not ending when all active players are all-in

- **EC-006**: All-In Then Call - 2 variants
  - Expected: `handEnded = true` (auto-advance to river)
  - Actual: `handEnded = false`
  - Issue: Auto-advancement not triggering when all players all-in

#### 3. Community Cards Duplication (8 failures)
- **TI-001, TI-002, TI-003, TI-006**: Multi-way tie scenarios
- **KI-001, KI-002, KI-003, KI-004**: Kicker scenarios
- **EC-008**: Kicker edge cases
- Error: `Expected 5 community cards, got 10`
- Issue: Community cards are being duplicated during round advancement

#### 4. Insufficient Balance / All-In Validation (8 failures)
- **FL-008**: All-In on Flop (Single Player) - 2 variants
  - Error: `Insufficient balance. Required: 99000000 gwei, Available: 49000000 gwei`
  - Issue: Call amount calculation incorrect for all-in scenarios

- **SP-004**: Partial All-In (Less Than Bet) - 2 variants
  - Error: `Insufficient balance. Required: 98000000 gwei, Available: 3000000 gwei`
  - Issue: Partial all-in not being handled correctly

- **EC-003**: All-In with Remaining Balance Less Than Bet - 2 variants
  - Error: `Insufficient balance. Required: 98000000 gwei, Available: 3000000 gwei`
  - Issue: All-in validation not accounting for partial calls

- **SP-005**: All-In Then Raise - 2 variants
  - Error: `Total bet amount (10000000 gwei) must be at least the current bet (100000000 gwei)`
  - Issue: Raise validation not handling all-in scenarios correctly

#### 5. Side Pot Creation (2 failures)
- **TU-004**: All-In on Turn (Multiple Players) - 2 variants
  - Expected: `pots.length > 1` (side pots)
  - Actual: `pots.length = 1`
  - Issue: Side pots not being created when commitments differ

#### 6. Hand Not Found / Premature Hand End (4 failures)
- **RV-001**: All Players Check on River (Showdown) - 2 variants
  - Error: `No active hand found for table`
  - Issue: Hand ending prematurely before all actions complete

- **MR-004**: Progressive Eliminations - 2 variants
  - Error: `No active hand found for table`
  - Issue: Hand ending when it should continue

#### 7. Action Validation (3 failures)
- **MR-006**: All-In on Different Rounds - 2 variants
  - Error: `Cannot call when there is no current bet. Use check instead.`
  - Issue: Test attempting to call when currentBet is 0

- **EC-001**: Minimum Raise Scenario
  - Error: `Cannot call when there is no current bet. Use check instead.`
  - Issue: Test attempting to call when currentBet is 0

#### 8. Pot Calculation (2 failures)
- **EC-005**: All-In Then Fold - 2 variants
  - Expected: `50000000n`
  - Actual: `53000000n`
  - Issue: Pot calculation includes chips from folded player incorrectly

#### 9. Dealer Rotation (3 failures)
- **RO-002**: Hand 2 - First Rotation
  - Expected: `dealerPosition = 1`
  - Actual: `dealerPosition = 0`
  - Issue: Dealer position not rotating between hands

- **RO-003**: Hand 3 - Second Rotation
  - Expected: `dealerPosition = 2`
  - Actual: `dealerPosition = 0`
  - Issue: Dealer position not rotating between hands

- **RO-004**: Hand 4 - Third Rotation
  - Expected: `dealerPosition = 3`
  - Actual: `dealerPosition = 0`
  - Issue: Dealer position not rotating between hands

---

## Priority Issues

### Critical (Blocking Core Functionality)
1. **Community Cards Duplication** (8 failures)
   - Cards being duplicated during round advancement
   - Affects all showdown scenarios

2. **Hand Not Found Errors** (4 failures)
   - Hands ending prematurely
   - Blocks multi-round scenarios

3. **Dealer Rotation** (3 failures)
   - Dealer position not rotating
   - Affects multi-hand scenarios

### High Priority (Core Game Logic)
4. **Round Advancement** (3 failures)
   - TU-001: All checks not advancing round
   - Affects basic gameplay flow

5. **All-In Hand Completion** (4 failures)
   - Hands not ending when all players all-in
   - Affects all-in scenarios

6. **Side Pot Creation** (2 failures)
   - Side pots not being created
   - Affects all-in scenarios with different stack sizes

### Medium Priority (Edge Cases)
7. **Insufficient Balance Validation** (8 failures)
   - All-in validation issues
   - Affects edge case scenarios

8. **Action Validation** (3 failures)
   - Test issues (calling when should check)
   - May indicate test bugs

9. **Pot Calculation** (2 failures)
   - Minor pot calculation discrepancies
   - May be test expectation issues

---

## Recommendations

1. **Immediate Fixes Needed:**
   - Fix community cards duplication bug
   - Fix hand ending prematurely
   - Fix dealer rotation logic

2. **Investigation Needed:**
   - Review all-in validation logic
   - Review side pot creation logic
   - Review round advancement for all-check scenarios

3. **Test Review:**
   - Review action validation failures (may be test bugs)
   - Review pot calculation expectations

---

## Test Coverage Summary

### 2-Player Tests: ✅ 100% Passing
- All core scenarios working correctly
- Round advancement functioning
- Pot calculations accurate

### 4-Player Tests: ⚠️ 64.7% Passing
- Core betting scenarios working
- Issues with:
  - Community cards handling
  - All-in scenarios
  - Multi-hand scenarios
  - Edge cases

