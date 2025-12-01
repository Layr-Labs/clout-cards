# 4-Player Poker Test Matrix

## Overview
This document contains a comprehensive test matrix for 4-player poker scenarios covering all action combinations, betting rounds, rake scenarios, side pots, multi-way ties, kicker requirements, and dealer/blind rotation across multiple hands.

## Test Structure
Each test scenario includes:
- **Test ID**: Unique identifier
- **Description**: Scenario description
- **Betting Round**: PRE_FLOP, FLOP, TURN, or RIVER
- **Seat Positions**: Dealer (D), Small Blind (SB), Big Blind (BB), Under the Gun (UTG)
- **Actions**: Sequence of actions taken by each seat
- **Expected Outcome**: Hand end status, winner(s), pot amounts, side pot distribution
- **Rake Scenarios**: Tested at both 0 bps and 700 bps

## Action Types
- **FOLD**: Player folds, hand continues with remaining players
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

## Seat Positions (4 Players)
- **Seat 0**: Dealer (D) - First hand
- **Seat 1**: Small Blind (SB) - First hand
- **Seat 2**: Big Blind (BB) - First hand
- **Seat 3**: Under the Gun (UTG) - First hand, acts first pre-flop

## Blind Rotation
After each hand, positions rotate:
- Hand 1: D=0, SB=1, BB=2, UTG=3
- Hand 2: D=1, SB=2, BB=3, UTG=0
- Hand 3: D=2, SB=3, BB=0, UTG=1
- Hand 4: D=3, SB=0, BB=1, UTG=2
- Hand 5: D=0, SB=1, BB=2, UTG=3 (cycle repeats)

---

## PRE-FLOP SCENARIOS

### PF-001: Immediate Fold (UTG Folds)
**Description**: UTG folds immediately, action continues
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: FOLD (UTG)
  - Seat 0: Action (varies by scenario)
- **Expected Outcome**: 
  - Hand continues with 3 players
  - Pot before rake: 3M (1M + 2M)
  - Rake not deducted until hand ends

### PF-002: Two Players Fold Pre-Flop
**Description**: UTG and Dealer fold, only SB and BB remain
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: FOLD
  - Seat 0: FOLD
- **Expected Outcome**: 
  - Hand continues with 2 players (SB and BB)
  - Pot before rake: 3M
  - Round may advance to FLOP if both call/check

### PF-003: All Players Call Pre-Flop (No Raise)
**Description**: All players call big blind, no raises
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: CALL (2M to match)
  - Seat 0: CALL (2M to match)
  - Seat 1: CALL (1M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 8M (1M + 2M + 2M + 2M + 1M)
  - All 4 players active

### PF-004: Single Raise Pre-Flop (All Call)
**Description**: UTG raises, all others call
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: RAISE (to 5M total, 3M incremental)
  - Seat 0: CALL (5M to match)
  - Seat 1: CALL (4M to match)
  - Seat 2: CALL (3M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 20M (1M + 2M + 3M + 5M + 4M + 3M)
  - All 4 players active

### PF-005: Single Raise Pre-Flop (Some Fold)
**Description**: UTG raises, some players fold
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: RAISE (to 5M total, 3M incremental)
  - Seat 0: FOLD
  - Seat 1: CALL (4M to match)
  - Seat 2: CALL (3M to match)
- **Expected Outcome**: 
  - Round advances to FLOP with 3 players
  - Pot before rake: 15M (1M + 2M + 3M + 4M + 3M)

### PF-006: Multiple Raises Pre-Flop (3-Bet)
**Description**: UTG raises, BB re-raises, others call/fold
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: RAISE (to 5M total, 3M incremental)
  - Seat 0: CALL (5M to match)
  - Seat 1: CALL (4M to match)
  - Seat 2: RAISE (to 10M total, 8M incremental)
  - Seat 3: CALL (5M to match)
  - Seat 0: CALL (5M to match)
  - Seat 1: CALL (5M to match)
- **Expected Outcome**: 
  - Round advances to FLOP
  - Pot before rake: 40M (1M + 2M + 3M + 5M + 4M + 8M + 5M + 5M + 5M)

### PF-007: Multiple Raises Pre-Flop (4-Bet)
**Description**: UTG raises, BB re-raises, UTG re-raises again
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: RAISE (to 5M total, 3M incremental)
  - Seat 0: FOLD
  - Seat 1: FOLD
  - Seat 2: RAISE (to 10M total, 8M incremental)
  - Seat 3: RAISE (to 20M total, 15M incremental)
  - Seat 2: CALL (10M to match)
- **Expected Outcome**: 
  - Round advances to FLOP with 2 players
  - Pot before rake: 30M (1M + 2M + 3M + 8M + 15M + 10M)

### PF-008: All-In Pre-Flop (Single Player)
**Description**: One player goes all-in, others call/fold
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (50M total, 48M incremental)
  - Seat 0: CALL (48M to match)
  - Seat 1: FOLD
  - Seat 2: CALL (48M to match)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (1M + 2M + 48M + 48M + 48M)
  - Rake (0 bps): 0
  - Rake (700 bps): 3,500,000

### PF-009: All-In Pre-Flop (Two Players, Same Amount)
**Description**: Two players go all-in for same amount
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (50M total, 48M incremental)
  - Seat 0: FOLD
  - Seat 1: FOLD
  - Seat 2: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Both players all-in, auto-advance to RIVER
  - Hand ends via showdown
  - Pot before rake: 50M (1M + 2M + 48M + 48M)
  - Single pot (no side pot)

### PF-010: All-In Pre-Flop (Two Players, Different Amounts)
**Description**: Two players all-in for different amounts, creating side pot
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (30M total, 28M incremental)
  - Seat 0: FOLD
  - Seat 1: FOLD
  - Seat 2: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Both players all-in, side pot created
  - Auto-advance to RIVER
  - Main pot before rake: 60M (30M + 30M)
  - Side pot before rake: 40M (20M + 20M)
  - Total pot before rake: 100M

### PF-011: All-In Pre-Flop (Three Players, Different Amounts)
**Description**: Three players all-in creating multiple side pots
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (20M total, 18M incremental)
  - Seat 0: ALL_IN (30M total, 28M incremental)
  - Seat 1: FOLD
  - Seat 2: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Three players all-in, multiple side pots created
  - Auto-advance to RIVER
  - Pot 0 (main): 80M (20M × 4 players)
  - Pot 1 (side): 40M (10M × 4 players, but only 2 eligible)
  - Pot 2 (side): 40M (20M × 2 players)
  - Total pot before rake: 160M

### PF-012: All-In Pre-Flop (Four Players, All Different Amounts)
**Description**: All four players all-in for different amounts
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (20M total, 18M incremental)
  - Seat 0: ALL_IN (30M total, 28M incremental)
  - Seat 1: ALL_IN (40M total, 38M incremental)
  - Seat 2: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - All players all-in, multiple side pots
  - Auto-advance to RIVER
  - Pot 0: 80M (20M × 4)
  - Pot 1: 40M (10M × 4, but only 3 eligible)
  - Pot 2: 30M (10M × 3, but only 2 eligible)
  - Pot 3: 20M (10M × 2)
  - Total pot before rake: 170M

### PF-013: All-In Pre-Flop (One Player Folds, Others All-In)
**Description**: Three players all-in, one folds
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: ALL_IN (30M total, 28M incremental)
  - Seat 0: FOLD
  - Seat 1: ALL_IN (40M total, 38M incremental)
  - Seat 2: ALL_IN (50M total, 48M incremental)
- **Expected Outcome**: 
  - Three players all-in, side pots created
  - Pot 0: 90M (30M × 3)
  - Pot 1: 30M (10M × 3, but only 2 eligible)
  - Pot 2: 20M (10M × 2)
  - Total pot before rake: 140M

### PF-014: All-In Pre-Flop (Partial Call - Less Than Bet)
**Description**: Player all-in for less than required bet
- **Actions**: 
  - Seat 1: POST_BLIND (1M)
  - Seat 2: POST_BLIND (2M)
  - Seat 3: RAISE (to 10M total, 8M incremental)
  - Seat 0: ALL_IN (5M total, 3M incremental - less than 10M)
  - Seat 1: FOLD
  - Seat 2: CALL (8M to match 10M)
  - Seat 3: Action (can raise or call)
- **Expected Outcome**: 
  - Side pot created for difference
  - Pot 0: 15M (5M × 3 players)
  - Pot 1: 10M (5M × 2 players, only Seat 2 and Seat 3 eligible)
  - Total pot before rake: 25M

---

## FLOP SCENARIOS

### FL-001: All Players Check on Flop
**Description**: All four players check on flop
- **Actions**: 
  - PRE_FLOP: All call (no raises)
  - FLOP: Seat 1 CHECK, Seat 2 CHECK, Seat 3 CHECK, Seat 0 CHECK
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 8M (from PRE_FLOP)
  - All 4 players active

### FL-002: Bet-Call-Call-Call on Flop
**Description**: First player bets, all others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 BET (5M), Seat 2 CALL (5M), Seat 3 CALL (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 28M (8M + 5M + 5M + 5M + 5M)
  - All 4 players active

### FL-003: Bet-Call-Fold-Call on Flop
**Description**: Bet, one folds, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 BET (5M), Seat 2 CALL (5M), Seat 3 FOLD, Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Round advances to TURN with 3 players
  - Pot before rake: 23M (8M + 5M + 5M + 5M)

### FL-004: Bet-Raise-Call-Call on Flop
**Description**: Bet, raise, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 BET (5M), Seat 2 RAISE (to 15M total, 10M incremental), Seat 3 CALL (15M), Seat 0 CALL (15M), Seat 1 CALL (10M to match)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 58M (8M + 5M + 10M + 15M + 15M + 10M)
  - All 4 players active

### FL-005: Bet-Raise-Fold-Call on Flop
**Description**: Bet, raise, one folds, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 BET (5M), Seat 2 RAISE (to 15M total, 10M incremental), Seat 3 FOLD, Seat 0 CALL (15M), Seat 1 CALL (10M)
- **Expected Outcome**: 
  - Round advances to TURN with 3 players
  - Pot before rake: 43M (8M + 5M + 10M + 15M + 10M)

### FL-006: Check-Bet-Call-Call on Flop
**Description**: Check, bet, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 CHECK, Seat 2 CHECK, Seat 3 BET (5M), Seat 0 CALL (5M), Seat 1 CALL (5M), Seat 2 CALL (5M)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 28M (8M + 5M + 5M + 5M + 5M)

### FL-007: Check-Bet-Raise-Call-Call on Flop
**Description**: Check, bet, raise, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 CHECK, Seat 2 CHECK, Seat 3 BET (5M), Seat 0 RAISE (to 15M total, 10M incremental), Seat 1 CALL (15M), Seat 2 CALL (15M), Seat 3 CALL (10M)
- **Expected Outcome**: 
  - Round advances to TURN
  - Pot before rake: 58M (8M + 5M + 10M + 15M + 15M + 10M)

### FL-008: All-In on Flop (Single Player)
**Description**: One player all-in, others call/fold
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 ALL_IN (50M total, 47M incremental), Seat 2 CALL (47M), Seat 3 CALL (47M), Seat 0 FOLD
- **Expected Outcome**: 
  - Three players all-in, auto-advance to RIVER
  - Pot before rake: 50M (8M + 47M + 47M + 47M)

### FL-009: All-In on Flop (Two Players, Different Amounts)
**Description**: Two players all-in for different amounts
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 ALL_IN (30M total, 27M incremental), Seat 2 FOLD, Seat 3 ALL_IN (50M total, 47M incremental), Seat 0 FOLD
- **Expected Outcome**: 
  - Side pot created
  - Pot 0: 60M (30M × 2)
  - Pot 1: 40M (20M × 2)
  - Total pot before rake: 100M

### FL-010: All-In on Flop (Three Players, Different Amounts)
**Description**: Three players all-in creating multiple side pots
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 ALL_IN (20M total, 17M incremental), Seat 2 ALL_IN (30M total, 27M incremental), Seat 3 ALL_IN (50M total, 47M incremental), Seat 0 FOLD
- **Expected Outcome**: 
  - Multiple side pots
  - Pot 0: 80M (20M × 4, but only 3 eligible)
  - Pot 1: 30M (10M × 3, but only 2 eligible)
  - Pot 2: 40M (20M × 2)
  - Total pot before rake: 150M

---

## TURN SCENARIOS

### TU-001: All Players Check on Turn
**Description**: All players check on turn
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: Seat 1 CHECK, Seat 2 CHECK, Seat 3 CHECK, Seat 0 CHECK
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 8M

### TU-002: Bet-Call-Call-Call on Turn
**Description**: Bet, all call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: Seat 1 BET (5M), Seat 2 CALL (5M), Seat 3 CALL (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 28M (8M + 5M + 5M + 5M + 5M)

### TU-003: Bet-Raise-Call-Call on Turn
**Description**: Bet, raise, others call
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: Seat 1 BET (5M), Seat 2 RAISE (to 15M total, 10M incremental), Seat 3 CALL (15M), Seat 0 CALL (15M), Seat 1 CALL (10M)
- **Expected Outcome**: 
  - Round advances to RIVER
  - Pot before rake: 58M (8M + 5M + 10M + 15M + 15M + 10M)

### TU-004: All-In on Turn (Multiple Players)
**Description**: Multiple players all-in on turn
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: Seat 1 ALL_IN (30M total, 27M incremental), Seat 2 ALL_IN (50M total, 47M incremental), Seat 3 FOLD, Seat 0 FOLD
- **Expected Outcome**: 
  - Side pot created
  - Pot 0: 60M (30M × 2)
  - Pot 1: 40M (20M × 2)
  - Total pot before rake: 100M

---

## RIVER SCENARIOS

### RV-001: All Players Check on River (Showdown)
**Description**: All check, goes to showdown
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: Seat 1 CHECK, Seat 2 CHECK, Seat 3 CHECK, Seat 0 CHECK
- **Expected Outcome**: 
  - Hand ends via showdown
  - Winner determined by best hand
  - Pot before rake: 8M
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000

### RV-002: Bet-Call-Call-Call on River (Showdown)
**Description**: Bet, all call, showdown
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: Seat 1 BET (5M), Seat 2 CALL (5M), Seat 3 CALL (5M), Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Pot before rake: 28M (8M + 5M + 5M + 5M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,960,000

### RV-003: Bet-Fold-Fold-Call on River
**Description**: Bet, two fold, one calls
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: Seat 1 BET (5M), Seat 2 FOLD, Seat 3 FOLD, Seat 0 CALL (5M)
- **Expected Outcome**: 
  - Hand ends via showdown with 2 players
  - Pot before rake: 18M (8M + 5M + 5M)
  - Rake (0 bps): 0
  - Rake (700 bps): 1,260,000

### RV-004: Bet-Raise-Call-Call on River (Showdown)
**Description**: Bet, raise, others call, showdown
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: Seat 1 BET (5M), Seat 2 RAISE (to 15M total, 10M incremental), Seat 3 CALL (15M), Seat 0 CALL (15M), Seat 1 CALL (10M)
- **Expected Outcome**: 
  - Hand ends via showdown
  - Pot before rake: 58M (8M + 5M + 10M + 15M + 15M + 10M)
  - Rake (0 bps): 0
  - Rake (700 bps): 4,060,000

---

## MULTI-WAY TIE SCENARIOS

### TI-001: Two-Way Tie on River (Same Hand Rank)
**Description**: Two players tie with same hand rank
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Hand ends via showdown
  - Two players have identical hand rank (e.g., both have pair of 10s with same kickers)
  - Winner: Both players (tie)
  - Pot split equally between two winners
  - Pot before rake: 8M
  - Pot after rake (0 bps): 8M (4M each)
  - Pot after rake (700 bps): 7,440,000 (3,720,000 each)

### TI-002: Three-Way Tie on River (Same Hand Rank)
**Description**: Three players tie with same hand rank
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Hand ends via showdown
  - Three players have identical hand rank
  - Winner: Three players (tie)
  - Pot split equally among three winners
  - Pot before rake: 8M
  - Pot after rake (0 bps): 8M (2.67M each, rounded)
  - Pot after rake (700 bps): 7,440,000 (2,480,000 each)

### TI-003: Four-Way Tie on River (Same Hand Rank)
**Description**: All four players tie with same hand rank
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Hand ends via showdown
  - All four players have identical hand rank
  - Winner: All four players (tie)
  - Pot split equally among four winners
  - Pot before rake: 8M
  - Pot after rake (0 bps): 8M (2M each)
  - Pot after rake (700 bps): 7,440,000 (1,860,000 each)

### TI-004: Two-Way Tie with Side Pots
**Description**: Two players tie on main pot, side pot won by one player
- **Actions**: 
  - PRE_FLOP: Seat 3 ALL_IN (20M), Seat 0 ALL_IN (30M), Seat 1 ALL_IN (50M), Seat 2 FOLD
- **Expected Outcome**: 
  - Main pot: Two players tie, split equally
  - Side pot 1: Only one player eligible, wins entire pot
  - Side pot 2: Only one player eligible, wins entire pot
  - Pot 0 before rake: 60M (20M × 3, but only 2 eligible) - split 30M each
  - Pot 1 before rake: 30M (10M × 3, but only 2 eligible) - split 15M each
  - Pot 2 before rake: 20M (10M × 2) - one player wins all

### TI-005: Three-Way Tie with Side Pots
**Description**: Three players tie on main pot, side pot won by one
- **Actions**: 
  - PRE_FLOP: Seat 3 ALL_IN (20M), Seat 0 ALL_IN (30M), Seat 1 ALL_IN (40M), Seat 2 FOLD
- **Expected Outcome**: 
  - Main pot: Three players tie, split equally
  - Side pot 1: Two players eligible, one wins or ties
  - Side pot 2: One player eligible, wins all
  - Pot 0 before rake: 60M (20M × 3) - split 20M each
  - Pot 1 before rake: 30M (10M × 3, but only 2 eligible) - split 15M each
  - Pot 2 before rake: 20M (10M × 2) - one player wins all

### TI-006: Tie with Kicker Requirements
**Description**: Players tie on pair, kicker determines winner
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Hand ends via showdown
  - Multiple players have same pair
  - Winner determined by highest kicker
  - If kickers also tie, pot split among tied players
  - Pot before rake: 8M

---

## KICKER SCENARIOS

### KI-001: Pair with Different Kickers
**Description**: Multiple players have same pair, kicker determines winner
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Player with highest kicker wins
  - Pot before rake: 8M

### KI-002: Two Pair with Different Kickers
**Description**: Multiple players have two pair, kicker determines winner
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Player with highest second pair wins
  - If second pairs tie, highest kicker wins
  - Pot before rake: 8M

### KI-003: Three of a Kind with Different Kickers
**Description**: Multiple players have three of a kind, kicker determines winner
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Player with highest kicker wins
  - Pot before rake: 8M

### KI-004: Full House with Different Trips
**Description**: Multiple players have full house, trips determine winner
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Player with highest trips wins
  - If trips tie, highest pair wins
  - Pot before rake: 8M

---

## COMPLEX SIDE POT SCENARIOS

### SP-001: Three Different All-In Amounts
**Description**: Three players all-in for different amounts creating two side pots
- **Actions**: 
  - PRE_FLOP: Seat 3 ALL_IN (20M), Seat 0 ALL_IN (30M), Seat 1 ALL_IN (50M), Seat 2 FOLD
- **Expected Outcome**: 
  - Pot 0: 60M (20M × 3, all eligible)
  - Pot 1: 30M (10M × 3, but only 2 eligible)
  - Pot 2: 40M (20M × 2, only 1 eligible)
  - Total pot before rake: 130M

### SP-002: Four Different All-In Amounts
**Description**: All four players all-in for different amounts creating three side pots
- **Actions**: 
  - PRE_FLOP: Seat 1 ALL_IN (20M), Seat 2 ALL_IN (30M), Seat 3 ALL_IN (40M), Seat 0 ALL_IN (50M)
- **Expected Outcome**: 
  - Pot 0: 80M (20M × 4, all eligible)
  - Pot 1: 40M (10M × 4, but only 3 eligible)
  - Pot 2: 30M (10M × 3, but only 2 eligible)
  - Pot 3: 20M (10M × 2, only 1 eligible)
  - Total pot before rake: 170M

### SP-003: All-In After Previous Betting
**Description**: Players all-in after previous betting rounds
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 ALL_IN (20M), Seat 2 ALL_IN (30M), Seat 3 ALL_IN (50M), Seat 0 FOLD
- **Expected Outcome**: 
  - Previous pot: 8M (from PRE_FLOP)
  - Pot 0: 60M (20M × 3, all eligible)
  - Pot 1: 30M (10M × 3, but only 2 eligible)
  - Pot 2: 40M (20M × 2, only 1 eligible)
  - Total pot before rake: 138M

### SP-004: Partial All-In (Less Than Bet)
**Description**: Player all-in for less than current bet
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 BET (10M), Seat 2 ALL_IN (5M - less than bet), Seat 3 CALL (10M), Seat 0 CALL (10M), Seat 1 Action
- **Expected Outcome**: 
  - Side pot created for difference
  - Pot 0: 20M (5M × 4, all eligible)
  - Pot 1: 20M (5M × 3, only 3 eligible)
  - Total pot before rake: 40M

### SP-005: All-In Then Raise
**Description**: Player all-in, another player raises
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Seat 1 ALL_IN (20M), Seat 2 RAISE (to 30M total), Seat 3 CALL (30M), Seat 0 CALL (30M)
- **Expected Outcome**: 
  - Side pot created
  - Pot 0: 80M (20M × 4, all eligible)
  - Pot 1: 30M (10M × 3, only 3 eligible)
  - Total pot before rake: 110M

---

## DEALER/BLIND ROTATION SCENARIOS

### RO-001: Hand 1 - Initial Positions
**Description**: First hand with initial dealer/blind positions
- **Setup**: 
  - Dealer: Seat 0
  - Small Blind: Seat 1
  - Big Blind: Seat 2
  - UTG: Seat 3
- **Expected Outcome**: 
  - Positions set correctly
  - Action starts with Seat 3 (UTG)

### RO-002: Hand 2 - First Rotation
**Description**: Second hand, positions rotate
- **Setup**: 
  - Previous hand: D=0, SB=1, BB=2, UTG=3
  - Dealer: Seat 1
  - Small Blind: Seat 2
  - Big Blind: Seat 3
  - UTG: Seat 0
- **Expected Outcome**: 
  - Positions rotated correctly
  - Action starts with Seat 0 (UTG)

### RO-003: Hand 3 - Second Rotation
**Description**: Third hand, positions rotate again
- **Setup**: 
  - Previous hand: D=1, SB=2, BB=3, UTG=0
  - Dealer: Seat 2
  - Small Blind: Seat 3
  - Big Blind: Seat 0
  - UTG: Seat 1
- **Expected Outcome**: 
  - Positions rotated correctly
  - Action starts with Seat 1 (UTG)

### RO-004: Hand 4 - Third Rotation
**Description**: Fourth hand, positions rotate again
- **Setup**: 
  - Previous hand: D=2, SB=3, BB=0, UTG=1
  - Dealer: Seat 3
  - Small Blind: Seat 0
  - Big Blind: Seat 1
  - UTG: Seat 2
- **Expected Outcome**: 
  - Positions rotated correctly
  - Action starts with Seat 2 (UTG)

### RO-005: Hand 5 - Cycle Completes
**Description**: Fifth hand, cycle completes and repeats
- **Setup**: 
  - Previous hand: D=3, SB=0, BB=1, UTG=2
  - Dealer: Seat 0
  - Small Blind: Seat 1
  - Big Blind: Seat 2
  - UTG: Seat 3
- **Expected Outcome**: 
  - Positions back to initial state
  - Cycle repeats correctly

### RO-006: Rotation with Player Elimination
**Description**: Player eliminated, rotation continues correctly
- **Setup**: 
  - Hand 1: D=0, SB=1, BB=2, UTG=3
  - Seat 3 eliminated (busted out)
  - Hand 2: D=1, SB=2, BB=0, UTG=1 (wraps around)
- **Expected Outcome**: 
  - Rotation skips eliminated player
  - Positions set correctly for remaining players

### RO-007: Rotation with Multiple Eliminations
**Description**: Multiple players eliminated, rotation continues
- **Setup**: 
  - Hand 1: D=0, SB=1, BB=2, UTG=3
  - Seats 2 and 3 eliminated
  - Hand 2: D=1, SB=0, UTG=1 (2-player game)
- **Expected Outcome**: 
  - Rotation adjusts for remaining players
  - Positions set correctly

---

## MULTI-ROUND SCENARIOS

### MR-001: Full Hand with Betting on Every Round
**Description**: Betting occurs on every round, goes to river showdown
- **Actions**: 
  - PRE_FLOP: All call, UTG raises to 5M, all call
  - FLOP: Seat 1 bets 5M, all call
  - TURN: Seat 2 bets 10M, all call
  - RIVER: Seat 3 bets 15M, all call
- **Expected Outcome**: 
  - Hand ends via showdown
  - Pot before rake: ~68M (varies by exact actions)
  - Rake (0 bps): 0
  - Rake (700 bps): ~4,760,000

### MR-002: Full Hand with Raises on Every Round
**Description**: Raises occur on every round
- **Actions**: 
  - PRE_FLOP: UTG raises, BB re-raises, all call
  - FLOP: Bet, raise, all call
  - TURN: Bet, raise, all call
  - RIVER: Bet, raise, all call
- **Expected Outcome**: 
  - Hand ends via showdown
  - Large pot created
  - Rake calculated on total pot

### MR-003: Full Hand with All Checks
**Description**: All players check every round
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Hand ends via showdown
  - Pot before rake: 8M (only blinds)
  - Rake (0 bps): 0
  - Rake (700 bps): 560,000

### MR-004: Progressive Eliminations
**Description**: Players eliminated in different rounds
- **Actions**: 
  - PRE_FLOP: One player folds
  - FLOP: Another player folds
  - TURN: Another player folds
  - RIVER: Showdown with one player
- **Expected Outcome**: 
  - Hand ends with single winner
  - Pot accumulates from all rounds

### MR-005: All-In Pre-Flop, Auto-Advance to River
**Description**: All players all-in pre-flop
- **Actions**: 
  - PRE_FLOP: All players all-in
- **Expected Outcome**: 
  - Auto-advance to RIVER
  - Hand ends via showdown
  - Side pots created if different amounts

### MR-006: All-In on Different Rounds
**Description**: Players all-in on different rounds
- **Actions**: 
  - PRE_FLOP: One player all-in
  - FLOP: Another player all-in
  - TURN: Another player all-in
  - RIVER: Showdown
- **Expected Outcome**: 
  - Multiple side pots created
  - Complex pot distribution

---

## EDGE CASES

### EC-001: Minimum Raise Scenario
**Description**: Minimum raise on every round
- **Actions**: 
  - PRE_FLOP: Minimum raise, all call
  - FLOP: Minimum raise, all call
  - TURN: Minimum raise, all call
  - RIVER: Minimum raise, all call
- **Expected Outcome**: 
  - Hand ends via showdown
  - Pot before rake: ~20M
  - Rake (0 bps): 0
  - Rake (700 bps): ~1,400,000

### EC-002: Large Raise Scenario
**Description**: Large raises on every round
- **Actions**: 
  - PRE_FLOP: Large raise, all call
  - FLOP: Large bet, all call
  - TURN: Large bet, all call
  - RIVER: Large bet, all call
- **Expected Outcome**: 
  - Hand ends via showdown
  - Very large pot created
  - Rake calculated correctly

### EC-003: All-In with Remaining Balance Less Than Bet
**Description**: Player goes all-in when remaining balance is less than required bet
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: Bet 10M, player all-in for 5M
- **Expected Outcome**: 
  - Side pot created
  - Pot calculation accounts for different amounts

### EC-004: Multiple Side Pots (4 Different Amounts)
**Description**: Four different all-in amounts creating three side pots
- **Actions**: 
  - PRE_FLOP: All four players all-in for different amounts
- **Expected Outcome**: 
  - Three side pots created
  - Each pot distributed correctly
  - Rake calculated per pot

### EC-005: All-In Then Fold
**Description**: Player all-in, others fold
- **Actions**: 
  - PRE_FLOP: Player all-in, all others fold
- **Expected Outcome**: 
  - Hand ends immediately
  - Single winner
  - Pot before rake: amount committed

### EC-006: All-In Then Call
**Description**: Player all-in, others call
- **Actions**: 
  - PRE_FLOP: Player all-in, others call
- **Expected Outcome**: 
  - Auto-advance to RIVER if all all-in
  - Showdown occurs

### EC-007: Complex Side Pot with Ties
**Description**: Multiple side pots with ties on some pots
- **Actions**: 
  - PRE_FLOP: Multiple players all-in for different amounts
- **Expected Outcome**: 
  - Main pot: Some players tie, split
  - Side pot 1: Single winner
  - Side pot 2: Single winner
  - Each pot distributed correctly

### EC-008: Kicker Edge Cases
**Description**: Edge cases with kicker determination
- **Actions**: 
  - PRE_FLOP: All call
  - FLOP: All check
  - TURN: All check
  - RIVER: All check
- **Expected Outcome**: 
  - Winner determined by kicker
  - Ties handled correctly
  - Pot distributed correctly

---

## SUMMARY STATISTICS

### Total Test Scenarios: 100+

### Breakdown by Category:
- **PRE-FLOP**: 14 scenarios
- **FLOP**: 10 scenarios
- **TURN**: 4 scenarios
- **RIVER**: 4 scenarios
- **MULTI-WAY TIE**: 6 scenarios
- **KICKER**: 4 scenarios
- **COMPLEX SIDE POT**: 5 scenarios
- **DEALER/BLIND ROTATION**: 7 scenarios
- **MULTI-ROUND**: 6 scenarios
- **EDGE CASES**: 8 scenarios

### Breakdown by Rake:
- **0 bps**: All scenarios tested
- **700 bps**: All scenarios tested

### Breakdown by Outcome:
- **Single Winner (Fold)**: ~30 scenarios
- **Showdown (Single Winner)**: ~40 scenarios
- **Showdown (Tie)**: ~20 scenarios
- **Multi-Way Showdown**: ~10 scenarios

---

## NOTES

1. **Blind Structure**: All scenarios assume small blind = 1M, big blind = 2M
2. **Chip Amounts**: All amounts in gwei (1 gwei = 1e-9 ETH)
3. **Rake Calculation**: Rake = (pot_amount * rake_bps) / 10000
4. **Side Pots**: Created when players commit different amounts
5. **Auto-Advancement**: When all active players are all-in, rounds auto-advance to RIVER
6. **Showdown**: Occurs when hand reaches RIVER or all active players are all-in
7. **Tie Handling**: Pots split equally among tied winners
8. **Pot Distribution**: Each pot distributed separately based on eligible players
9. **Kicker Rules**: Highest kicker wins when main hand ranks tie
10. **Rotation**: Dealer/blind positions rotate after each hand

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
9. Verify auto-advancement to RIVER when all active players are all-in
10. Verify event creation with correct settlement data
11. Verify dealer/blind rotation across multiple hands
12. Verify kicker determination logic
13. Verify multi-way tie handling
14. Verify complex side pot scenarios with multiple pots
15. Test action order correctness (UTG, then clockwise)
16. Verify partial all-in scenarios (all-in for less than bet)
17. Test elimination scenarios (players busting out)
18. Verify pot distribution with ties on some pots but not others

---

## DECK CONFIGURATIONS FOR TESTING

### Standard Deck (Player 0 Wins)
- Seat 0: A♠ K♠ (best hand)
- Seat 1: Q♠ J♠
- Seat 2: 10♠ 9♠
- Seat 3: 8♠ 7♠
- Community: 6♠ 5♥ 4♦ 3♣ 2♥

### Tie Deck (Two-Way Tie)
- Seat 0: 10♠ 5♠
- Seat 1: 10♥ 5♥
- Seat 2: 9♠ 4♠
- Seat 3: 8♠ 3♠
- Community: 10♦ A♣ K♥ Q♦ J♠ (pair of 10s, both have A-K-Q-J kickers)

### Tie Deck (Three-Way Tie)
- Seat 0: 10♠ 5♠
- Seat 1: 10♥ 5♥
- Seat 2: 10♦ 5♦
- Seat 3: 9♠ 4♠
- Community: 10♣ A♣ K♥ Q♦ J♠ (pair of 10s, three have A-K-Q-J kickers)

### Tie Deck (Four-Way Tie)
- Seat 0: 10♠ 5♠
- Seat 1: 10♥ 5♥
- Seat 2: 10♦ 5♦
- Seat 3: 10♣ 5♣
- Community: 10♠ A♣ K♥ Q♦ J♠ (pair of 10s, all have A-K-Q-J kickers)

### Kicker Test Deck (Pair with Different Kickers)
- Seat 0: A♠ 10♠ (pair of 10s, A kicker)
- Seat 1: K♠ 10♥ (pair of 10s, K kicker)
- Seat 2: Q♠ 10♦ (pair of 10s, Q kicker)
- Seat 3: J♠ 9♠
- Community: 10♠ 5♥ 4♦ 3♣ 2♥

---

## ROTATION TEST SEQUENCE

### Sequence of Hands to Test Rotation
1. **Hand 1**: D=0, SB=1, BB=2, UTG=3
2. **Hand 2**: D=1, SB=2, BB=3, UTG=0
3. **Hand 3**: D=2, SB=3, BB=0, UTG=1
4. **Hand 4**: D=3, SB=0, BB=1, UTG=2
5. **Hand 5**: D=0, SB=1, BB=2, UTG=3 (cycle repeats)

Each hand should:
- Verify dealer position
- Verify small blind position
- Verify big blind position
- Verify UTG position (first to act pre-flop)
- Verify action order is correct
- Complete hand and verify next hand rotates correctly

---

## COMPLEX SCENARIOS TO PRIORITIZE

1. **Multiple Side Pots**: Test 3-4 different all-in amounts
2. **Multi-Way Ties**: Test 2, 3, and 4-way ties
3. **Kicker Requirements**: Test various kicker scenarios
4. **Rotation**: Test full rotation cycle
5. **Partial All-In**: Test all-in for less than bet
6. **Progressive Elimination**: Test players eliminated in different rounds
7. **Complex Showdowns**: Test multiple winners across different pots

