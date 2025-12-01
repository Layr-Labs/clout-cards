# 2-Player Poker Test Matrix

## Overview
This document contains a comprehensive test matrix for 2-player poker scenarios covering all action combinations, betting rounds, and rake scenarios.

## Test Structure
Each test scenario includes:
- **Test ID**: Unique identifier
- **Description**: Scenario description
- **Betting Round**: PRE_FLOP, FLOP, TURN, or RIVER
- **Actions**: Sequence of actions taken
- **Expected Outcome**: Hand end status, winner, pot amounts
- **Rake Scenarios**: Tested at both 0 bps and 700 bps

## Action Types
- **FOLD**: Player folds, hand ends immediately (single winner)
- **CHECK**: Player checks (only if no current bet)
- **CALL**: Player matches current bet
- **BET**: Player bets (first bet in round)
- **RAISE**: Player raises (increases existing bet)
- **ALL_IN**: Player commits all chips

## Betting Rounds
- **PRE_FLOP**: Before community cards
- **FLOP**: After 3 community cards
- **TURN**: After 4 community cards
- **RIVER**: After 5 community cards (final round)

---

## PRE-FLOP SCENARIOS

### PF-001: Immediate Fold (Small Blind Folds)
**Description**: Small blind folds immediately after big blind posts
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 3M (1M + 2M)
  - Rake (0 bps): 0
  - Rake (700 bps): 210,000 (3M * 7%)
  - Pot after rake (0 bps): 3M
  - Pot after rake (700 bps): 2,790,000

### PF-002: Immediate Fold (Big Blind Folds)
**Description**: Big blind folds when small blind raises
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: RAISE (to 5M total, 4M incremental)
  - Seat 1: FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 5M (1M + 4M)
  - Rake (0 bps): 0
  - Rake (700 bps): 350,000 (5M * 7%)
  - Pot after rake (0 bps): 5M
  - Pot after rake (700 bps): 4,650,000

### PF-003: Call Pre-Flop (No Raise)
**Description**: Small blind calls big blind, no raises
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: CALL (1M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 3M (1M + 2M)
  - Rake not deducted until hand ends

### PF-004: Single Raise Pre-Flop (Call)
**Description**: Small blind raises, big blind calls
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: RAISE (to 5M total, 4M incremental)
  - Seat 1: CALL (3M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 5M (1M + 4M + 3M)
  - Rake not deducted until hand ends

### PF-005: Single Raise Pre-Flop (Fold)
**Description**: Small blind raises, big blind folds
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: RAISE (to 5M total, 4M incremental)
  - Seat 1: FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 5M (1M + 4M)
  - Rake (0 bps): 0
  - Rake (700 bps): 350,000
  - Pot after rake (0 bps): 5M
  - Pot after rake (700 bps): 4,650,000

### PF-006: Multiple Raises Pre-Flop (3-Bet)
**Description**: Small blind raises, big blind re-raises, small blind calls
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: RAISE (to 5M total, 4M incremental)
  - Seat 1: RAISE (to 10M total, 8M incremental)
  - Seat 0: CALL (5M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 10M (1M + 4M + 8M + 5M)
  - Rake not deducted until hand ends

### PF-007: Multiple Raises Pre-Flop (4-Bet)
**Description**: Small blind raises, big blind re-raises, small blind re-raises, big blind calls
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: RAISE (to 5M total, 4M incremental)
  - Seat 1: RAISE (to 10M total, 8M incremental)
  - Seat 0: RAISE (to 20M total, 15M incremental)
  - Seat 1: CALL (10M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 20M (1M + 4M + 8M + 15M + 10M)
  - Rake not deducted until hand ends

### PF-008: Small Blind All-In Pre-Flop (Big Blind Calls)
**Description**: Small blind goes all-in, big blind calls
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: ALL_IN (50M total, 49M incremental)
  - Seat 1: CALL (48M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (1M + 49M + 48M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000 (50M * 7%)
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### PF-009: Small Blind All-In Pre-Flop (Big Blind Folds)
**Description**: Small blind goes all-in, big blind folds
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: ALL_IN (50M total, 49M incremental)
  - Seat 1: FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 50M (1M + 49M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### PF-010: Big Blind All-In Pre-Flop (Small Blind Calls)
**Description**: Big blind goes all-in, small blind calls
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: CALL (1M to match)
  - Seat 1: ALL_IN (50M total, 48M incremental)
  - Seat 0: CALL (48M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (1M + 1M + 48M + 48M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### PF-011: Both Players All-In Pre-Flop (Different Amounts)
**Description**: Small blind all-in for less, big blind all-in for more
- **Actions**: 
  - Seat 0: POST_BLIND (1M)
  - Seat 1: POST_BLIND (2M)
  - Seat 0: ALL_IN (30M total, 29M incremental)
  - Seat 1: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Both players all-in, side pot created
  - Auto-advance to RIVER
  - Hand ends via showdown
  - Main pot before rake: 60M (30M + 30M)
  - Side pot before rake: 40M (20M + 20M)
  - Total pot before rake: 100M
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000 (100M * 7%)
  - Main pot after rake (0 bps): 60M
  - Side pot after rake (0 bps): 40M
  - Main pot after rake (700 bps): 55,800,000 (60M - 4,200,000 rake)
  - Side pot after rake (700 bps): 37,200,000 (40M - 2,800,000 rake)

---

## FLOP SCENARIOS

### FL-001: Check-Check on Flop
**Description**: Both players check on flop
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 3M
  - Rake not deducted until hand ends

### FL-002: Bet-Call on Flop
**Description**: Small blind bets, big blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 CALL (5M)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake not deducted until hand ends

### FL-003: Bet-Fold on Flop
**Description**: Small blind bets, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000 (8M * 7%)
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### FL-004: Bet-Raise-Call on Flop
**Description**: Small blind bets, big blind raises, small blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 CALL (10M to match)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 23M (3M + 5M + 10M + 10M)
  - Rake not deducted until hand ends

### FL-005: Bet-Raise-Fold on Flop
**Description**: Small blind bets, big blind raises, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 18M (3M + 5M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,260,000 (18M * 7%)
  - Pot after rake (0 bps): 18M
  - Pot after rake (700 bps): 16,740,000

### FL-006: Check-Bet-Call on Flop
**Description**: Small blind checks, big blind bets, small blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake not deducted until hand ends

### FL-007: Check-Bet-Fold on Flop
**Description**: Small blind checks, big blind bets, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### FL-008: Small Blind All-In on Flop (Big Blind Calls)
**Description**: Small blind goes all-in on flop, big blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 CALL (47M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (3M + 47M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### FL-009: Small Blind All-In on Flop (Big Blind Folds)
**Description**: Small blind goes all-in on flop, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 50M (3M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### FL-010: Both Players All-In on Flop (Different Amounts)
**Description**: Small blind all-in for less, big blind all-in for more
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 ALL_IN (30M total, 27M incremental), Seat 1 ALL_IN (50M total, 47M incremental)
- **Expected Outcome**: 
  - Both players all-in, side pot created
  - Auto-advance to RIVER
  - Hand ends via showdown
  - Main pot before rake: 60M (30M + 30M)
  - Side pot before rake: 40M (20M + 20M)
  - Total pot before rake: 100M
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000
  - Main pot after rake (0 bps): 60M
  - Side pot after rake (0 bps): 40M
  - Main pot after rake (700 bps): 55,800,000
  - Side pot after rake (700 bps): 37,200,000

---

## TURN SCENARIOS

### TU-001: Check-Check on Turn
**Description**: Both players check on turn
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 3M
  - Rake not deducted until hand ends

### TU-002: Bet-Call on Turn
**Description**: Small blind bets, big blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 BET (5M), Seat 1 CALL (5M)
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake not deducted until hand ends

### TU-003: Bet-Fold on Turn
**Description**: Small blind bets, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 BET (5M), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### TU-004: Bet-Raise-Call on Turn
**Description**: Small blind bets, big blind raises, small blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 CALL (10M to match)
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 23M (3M + 5M + 10M + 10M)
  - Rake not deducted until hand ends

### TU-005: Bet-Raise-Fold on Turn
**Description**: Small blind bets, big blind raises, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 18M (3M + 5M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,260,000
  - Pot after rake (0 bps): 18M
  - Pot after rake (700 bps): 16,740,000

### TU-006: Check-Bet-Call on Turn
**Description**: Small blind checks, big blind bets, small blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake not deducted until hand ends

### TU-007: Check-Bet-Fold on Turn
**Description**: Small blind checks, big blind bets, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### TU-008: Small Blind All-In on Turn (Big Blind Calls)
**Description**: Small blind goes all-in on turn, big blind calls
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 CALL (47M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (3M + 47M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### TU-009: Small Blind All-In on Turn (Big Blind Folds)
**Description**: Small blind goes all-in on turn, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 50M (3M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### TU-010: Both Players All-In on Turn (Different Amounts)
**Description**: Small blind all-in for less, big blind all-in for more
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 ALL_IN (30M total, 27M incremental), Seat 1 ALL_IN (50M total, 47M incremental)
- **Expected Outcome**: 
  - Both players all-in, side pot created
  - Auto-advance to RIVER
  - Hand ends via showdown
  - Main pot before rake: 60M (30M + 30M)
  - Side pot before rake: 40M (20M + 20M)
  - Total pot before rake: 100M
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000
  - Main pot after rake (0 bps): 60M
  - Side pot after rake (0 bps): 40M
  - Main pot after rake (700 bps): 55,800,000
  - Side pot after rake (700 bps): 37,200,000

---

## RIVER SCENARIOS

### RV-001: Check-Check on River (Showdown)
**Description**: Both players check on river, hand goes to showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 CHECK, Seat 1 CHECK
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 3M
  - Rake (0 bps): 0
  - Rake (700 bps): 210,000 (3M * 7%)
  - Pot after rake (0 bps): 3M
  - Pot after rake (700 bps): 2,790,000

### RV-002: Bet-Call on River (Showdown)
**Description**: Small blind bets, big blind calls, hand goes to showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 BET (5M), Seat 1 CALL (5M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 910,000 (13M * 7%)
  - Pot after rake (0 bps): 13M
  - Pot after rake (700 bps): 12,090,000

### RV-003: Bet-Fold on River
**Description**: Small blind bets, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 BET (5M), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### RV-004: Bet-Raise-Call on River (Showdown)
**Description**: Small blind bets, big blind raises, small blind calls, hand goes to showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 CALL (10M to match)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 23M (3M + 5M + 10M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,610,000 (23M * 7%)
  - Pot after rake (0 bps): 23M
  - Pot after rake (700 bps): 21,390,000

### RV-005: Bet-Raise-Fold on River
**Description**: Small blind bets, big blind raises, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 BET (5M), Seat 1 RAISE (to 15M total, 10M incremental), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 18M (3M + 5M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,260,000
  - Pot after rake (0 bps): 18M
  - Pot after rake (700 bps): 16,740,000

### RV-006: Check-Bet-Call on River (Showdown)
**Description**: Small blind checks, big blind bets, small blind calls, hand goes to showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 13M (3M + 5M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 910,000
  - Pot after rake (0 bps): 13M
  - Pot after rake (700 bps): 12,090,000

### RV-007: Check-Bet-Fold on River
**Description**: Small blind checks, big blind bets, small blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 CHECK, Seat 1 BET (5M), Seat 0 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 1 (single winner)
  - Pot before rake: 8M (3M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000
  - Pot after rake (0 bps): 8M
  - Pot after rake (700 bps): 7,440,000

### RV-008: Small Blind All-In on River (Big Blind Calls)
**Description**: Small blind goes all-in on river, big blind calls, hand goes to showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 CALL (47M to match)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 50M (3M + 47M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### RV-009: Small Blind All-In on River (Big Blind Folds)
**Description**: Small blind goes all-in on river, big blind folds
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 50M (3M + 47M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### RV-010: Both Players All-In on River (Different Amounts)
**Description**: Small blind all-in for less, big blind all-in for more
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 ALL_IN (30M total, 27M incremental), Seat 1 ALL_IN (50M total, 47M incremental)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Main pot before rake: 60M (30M + 30M)
  - Side pot before rake: 40M (20M + 20M)
  - Total pot before rake: 100M
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000
  - Main pot after rake (0 bps): 60M
  - Side pot after rake (0 bps): 40M
  - Main pot after rake (700 bps): 55,800,000
  - Side pot after rake (700 bps): 37,200,000

---

## MULTI-ROUND SCENARIOS

### MR-001: Full Hand with Betting on Every Round
**Description**: Betting occurs on every round, goes to river showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 RAISE (to 5M, 4M incremental), Seat 1 CALL (3M)
  - FLOP: Seat 0 BET (5M), Seat 1 CALL (5M)
  - TURN: Seat 0 BET (10M), Seat 1 CALL (10M)
  - RIVER: Seat 0 BET (15M), Seat 1 CALL (15M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 50M (5M + 5M + 5M + 10M + 10M + 15M + 15M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000 (50M * 7%)
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### MR-002: Full Hand with Raises on Every Round
**Description**: Raises occur on every round, goes to river showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 RAISE (to 5M, 4M incremental), Seat 1 RAISE (to 10M, 8M incremental), Seat 0 CALL (5M)
  - FLOP: Seat 0 BET (5M), Seat 1 RAISE (to 15M, 10M incremental), Seat 0 CALL (10M)
  - TURN: Seat 0 BET (10M), Seat 1 RAISE (to 25M, 15M incremental), Seat 0 CALL (15M)
  - RIVER: Seat 0 BET (15M), Seat 1 RAISE (to 35M, 20M incremental), Seat 0 CALL (20M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 70M (10M + 5M + 5M + 10M + 10M + 15M + 15M + 20M)
  - Rake (0 bps): 0
  - Rake (700 bps): 4,900,000 (70M * 7%)
  - Pot after rake (0 bps): 70M
  - Pot after rake (700 bps): 65,100,000

### MR-003: Full Hand with All Checks
**Description**: Both players check every round, goes to river showdown
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 CHECK, Seat 1 CHECK
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 3M
  - Rake (0 bps): 0
  - Rake (700 bps): 210,000
  - Pot after rake (0 bps): 3M
  - Pot after rake (700 bps): 2,790,000

### MR-004: Fold on Flop After Pre-Flop Action
**Description**: Pre-flop betting, then fold on flop
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 RAISE (to 5M, 4M incremental), Seat 1 CALL (3M)
  - FLOP: Seat 0 BET (5M), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 10M (5M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 700,000
  - Pot after rake (0 bps): 10M
  - Pot after rake (700 bps): 9,300,000

### MR-005: Fold on Turn After Flop Action
**Description**: Pre-flop and flop betting, then fold on turn
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 CALL (5M)
  - TURN: Seat 0 BET (10M), Seat 1 FOLD
- **Expected Outcome**: 
  - Hand ends immediately
  - Winner: Seat 0 (single winner)
  - Pot before rake: 18M (3M + 5M + 5M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,260,000
  - Pot after rake (0 bps): 18M
  - Pot after rake (700 bps): 16,740,000

### MR-006: All-In Pre-Flop, Auto-Advance to River
**Description**: Both players all-in pre-flop, auto-advance to river
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 ALL_IN (50M total, 49M incremental), Seat 1 CALL (48M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### MR-007: All-In Flop, Auto-Advance to River
**Description**: Both players all-in on flop, auto-advance to river
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 CALL (47M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

### MR-008: All-In Turn, Auto-Advance to River
**Description**: Both players all-in on turn, auto-advance to river
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 ALL_IN (50M total, 47M incremental), Seat 1 CALL (47M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000
  - Pot after rake (0 bps): 50M
  - Pot after rake (700 bps): 46,500,000

---

## TIE SCENARIOS (SHOWDOWN)

### TI-001: Tie on River (Same Hand Rank)
**Description**: Both players have same hand rank, pot split
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 CHECK, Seat 1 CHECK
- **Expected Outcome**: 
  - Hand ends via showdown
  - Both players have identical hand rank (e.g., both have pair of 10s with same kickers)
  - Winner: Both players (tie)
  - Pot split equally
  - Pot before rake: 3M
  - Rake (0 bps): 0
  - Rake (700 bps): 210,000
  - Pot after rake (0 bps): 3M (1.5M each)
  - Pot after rake (700 bps): 2,790,000 (1,395,000 each)

### TI-002: Tie on River with Betting (Same Hand Rank)
**Description**: Both players bet and have same hand rank, pot split
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 CHECK, Seat 1 CHECK
  - TURN: Seat 0 CHECK, Seat 1 CHECK
  - RIVER: Seat 0 BET (5M), Seat 1 CALL (5M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Both players have identical hand rank
  - Winner: Both players (tie)
  - Pot split equally
  - Pot before rake: 13M
  - Rake (0 bps): 0
  - Rake (700 bps): 910,000
  - Pot after rake (0 bps): 13M (6.5M each)
  - Pot after rake (700 bps): 12,090,000 (6,045,000 each)

### TI-003: Tie with Side Pots (Different All-In Amounts)
**Description**: Both players all-in for different amounts, tie on main pot
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 ALL_IN (30M total, 29M incremental), Seat 1 ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Both players all-in, side pot created
  - Auto-advance to RIVER
  - Hand ends via showdown
  - Main pot: Both players tie, split equally
  - Side pot: Only Seat 1 eligible, wins entire side pot
  - Main pot before rake: 60M
  - Side pot before rake: 40M
  - Total pot before rake: 100M
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000
  - Main pot after rake (0 bps): 60M (30M each)
  - Side pot after rake (0 bps): 40M (Seat 1 only)
  - Main pot after rake (700 bps): 55,800,000 (27,900,000 each)
  - Side pot after rake (700 bps): 37,200,000 (Seat 1 only)

---

## EDGE CASES

### EC-001: Minimum Raise Scenario
**Description**: Minimum raise on every round
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 RAISE (to 4M, 2M incremental minimum), Seat 1 CALL (2M)
  - FLOP: Seat 0 BET (2M), Seat 1 RAISE (to 4M, 2M incremental minimum), Seat 0 CALL (2M)
  - TURN: Seat 0 BET (2M), Seat 1 RAISE (to 4M, 2M incremental minimum), Seat 0 CALL (2M)
  - RIVER: Seat 0 BET (2M), Seat 1 RAISE (to 4M, 2M incremental minimum), Seat 0 CALL (2M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 20M
  - Rake (0 bps): 0
  - Rake (700 bps): 1,400,000
  - Pot after rake (0 bps): 20M
  - Pot after rake (700 bps): 18,600,000

### EC-002: Large Raise Scenario
**Description**: Large raises on every round
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 RAISE (to 50M, 49M incremental), Seat 1 CALL (48M)
  - FLOP: Seat 0 BET (50M), Seat 1 CALL (50M)
  - TURN: Seat 0 BET (50M), Seat 1 CALL (50M)
  - RIVER: Seat 0 BET (50M), Seat 1 CALL (50M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 250M
  - Rake (0 bps): 0
  - Rake (700 bps): 17,500,000
  - Pot after rake (0 bps): 250M
  - Pot after rake (700 bps): 232,500,000

### EC-003: All-In with Remaining Balance Less Than Bet
**Description**: Player goes all-in when remaining balance is less than required bet
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M), Seat 0 CALL (1M)
  - FLOP: Seat 0 BET (5M), Seat 1 ALL_IN (3M remaining, less than 5M bet)
- **Expected Outcome**: 
  - Seat 1 goes all-in for less than the bet
  - Side pot may be created if Seat 0 has more chips
  - Hand continues or ends based on remaining actions
  - Pot calculation accounts for different commitment amounts

### EC-004: Multiple Side Pots
**Description**: Three different all-in amounts creating multiple side pots
- **Actions**: 
  - PRE_FLOP: Seat 0 POST_BLIND (1M), Seat 1 POST_BLIND (2M)
  - Seat 0 ALL_IN (20M total, 19M incremental)
  - Seat 1 ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Main pot: 40M (20M + 20M)
  - Side pot 1: 60M (30M + 30M)
  - Total pot: 100M
  - Rake calculated per pot
  - Rake (0 bps): 0
  - Rake (700 bps): 7,000,000 (distributed across pots)

---

## SUMMARY STATISTICS

### Total Test Scenarios: 60+

### Breakdown by Category:
- **PRE-FLOP**: 11 scenarios
- **FLOP**: 10 scenarios
- **TURN**: 10 scenarios
- **RIVER**: 10 scenarios
- **MULTI-ROUND**: 8 scenarios
- **TIE**: 3 scenarios
- **EDGE CASES**: 4 scenarios

### Breakdown by Rake:
- **0 bps**: All scenarios tested
- **700 bps**: All scenarios tested

### Breakdown by Outcome:
- **Single Winner (Fold)**: ~30 scenarios
- **Showdown (Winner)**: ~25 scenarios
- **Showdown (Tie)**: ~5 scenarios

---

## NOTES

1. **Blind Structure**: All scenarios assume small blind = 1M, big blind = 2M
2. **Chip Amounts**: All amounts in gwei (1 gwei = 1e-9 ETH)
3. **Rake Calculation**: Rake = (pot_amount * rake_bps) / 10000
4. **Side Pots**: Created when players commit different amounts
5. **Auto-Advancement**: When all players are all-in, rounds auto-advance to RIVER
6. **Showdown**: Occurs when hand reaches RIVER or all players are all-in
7. **Tie Handling**: Pots split equally among tied winners
8. **Pot Distribution**: Each pot distributed separately based on eligible players

---

## TEST IMPLEMENTATION NOTES

When implementing these tests:
1. Use deterministic deck shuffling for reproducible results
2. Set up proper initial balances for each scenario
3. Verify rake is added to TEE escrow balance
4. Verify pot amounts match expected values
5. Verify winner determination matches expected outcome
6. Test both 0 bps and 700 bps rake scenarios
7. Verify side pot creation and distribution when applicable
8. Verify hand evaluation and comparison logic for showdowns
9. Verify auto-advancement to RIVER when all players are all-in
10. Verify event creation with correct settlement data

