import './BetRaiseDialog.css'
import { useState, useEffect } from 'react'
import { formatEth } from '../utils/formatEth'

/**
 * Bet/Raise Dialog Component Props
 */
export interface BetRaiseDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (amountGwei: string) => void
  currentBet: string | null // Current highest bet (null if no bet)
  chipsCommitted: string // Player's chips committed this round
  tableBalanceGwei: string // Player's available table balance
  bigBlind: string // Big blind amount in gwei
  minimumRaise: string // Minimum raise amount in gwei
  isBetting: boolean // True if betting (currentBet === 0), false if raising
  isLoading?: boolean
}

/**
 * Bet/Raise Dialog Component
 *
 * Dialog for selecting bet/raise amount with slider, quick buttons, and manual input.
 * Supports betting (when no current bet) and raising (when bet exists).
 */
export function BetRaiseDialog({
  isOpen,
  onClose,
  onConfirm,
  currentBet,
  chipsCommitted,
  tableBalanceGwei,
  bigBlind,
  minimumRaise,
  isBetting,
  isLoading = false,
}: BetRaiseDialogProps) {
  const [betAmount, setBetAmount] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const chipsCommittedNum = BigInt(chipsCommitted)
  const tableBalanceNum = BigInt(tableBalanceGwei)
  const bigBlindNum = BigInt(bigBlind)
  const minimumRaiseNum = BigInt(minimumRaise)

  // Calculate available balance (what player can bet/raise)
  const availableBalance = tableBalanceNum

  // Ensure minimum raise is at least the big blind
  const effectiveMinimumRaise = minimumRaiseNum > bigBlindNum ? minimumRaiseNum : bigBlindNum

  // Calculate minimum and maximum INCREMENTAL bet amounts (what player adds from balance)
  // For betting: minimum incremental is bigBlind (since chipsCommitted is 0 or just blinds)
  // For raising: minimum incremental is minimumRaise (to raise by minimumRaise from currentBet), but at least big blind
  const minIncrementalAmount = isBetting ? bigBlindNum : effectiveMinimumRaise
  const maxIncrementalAmount = availableBalance // Can't bet more than available balance

  // Calculate quick bet amounts (as incremental amounts)
  const quickAmounts = (() => {
    if (isBetting) {
      // Betting: Min (big blind), 2x, 3x, All-in
      return [
        { label: 'Min Bet', amount: bigBlindNum },
        { label: '2x', amount: bigBlindNum * 2n },
        { label: '3x', amount: bigBlindNum * 3n },
        { label: 'All-in', amount: maxIncrementalAmount, isAllIn: true },
      ]
    } else {
      // Raising: Min Raise (at least big blind), 2x Min, 3x Min, All-in
      return [
        { label: 'Min Raise', amount: effectiveMinimumRaise },
        { label: '2x Min', amount: effectiveMinimumRaise * 2n },
        { label: '3x Min', amount: effectiveMinimumRaise * 3n },
        { label: 'All-in', amount: maxIncrementalAmount, isAllIn: true },
      ]
    }
  })()

  // Filter quick amounts to only those <= maxIncrementalAmount
  const validQuickAmounts = quickAmounts.filter(q => q.amount <= maxIncrementalAmount)

  // Initialize bet amount to minimum when dialog opens
  useEffect(() => {
    if (isOpen) {
      setBetAmount(minIncrementalAmount.toString())
      setError(null)
    }
  }, [isOpen, minIncrementalAmount])

  // Validate incremental bet amount
  useEffect(() => {
    if (!betAmount) {
      setError(null)
      return
    }

    try {
      const incrementalAmount = BigInt(betAmount)

      if (incrementalAmount < minIncrementalAmount) {
        setError(`Minimum ${isBetting ? 'bet' : 'raise'} is ${formatEth(minIncrementalAmount)}`)
        return
      }

      if (incrementalAmount > maxIncrementalAmount) {
        setError(`Maximum ${isBetting ? 'bet' : 'raise'} is ${formatEth(maxIncrementalAmount)} (your balance)`)
        return
      }

      // Check if amount is in increments of big blind (skip for all-in)
      // All-in is exempt because player's balance may not be a perfect multiple of big blind
      const isAllIn = incrementalAmount === maxIncrementalAmount
      if (!isAllIn) {
        const remainder = incrementalAmount % bigBlindNum
        if (remainder !== 0n) {
          setError(`Amount must be in increments of ${formatEth(bigBlindNum)} (big blind)`)
          return
        }
      }

      setError(null)
    } catch (err) {
      setError('Invalid amount')
    }
  }, [betAmount, minIncrementalAmount, maxIncrementalAmount, bigBlindNum, isBetting])

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const percentage = parseFloat(e.target.value)
    const amount = minIncrementalAmount + ((maxIncrementalAmount - minIncrementalAmount) * BigInt(Math.floor(percentage * 100)) / 10000n)
    // Round to nearest big blind increment
    const rounded = (amount / bigBlindNum) * bigBlindNum
    setBetAmount(rounded.toString())
  }

  function handleQuickAmountClick(amount: bigint) {
    // Set the bet amount - user still needs to click Bet/Raise button to confirm
    setBetAmount(amount.toString())
  }

  function handleConfirm() {
    if (error || !betAmount) {
      return
    }

    try {
      const amount = BigInt(betAmount)
      if (amount < minIncrementalAmount || amount > maxIncrementalAmount) {
        return
      }

      onConfirm(betAmount)
    } catch (err) {
      // Invalid amount, don't proceed
    }
  }

  if (!isOpen) return null

  const incrementalAmountNum = betAmount ? BigInt(betAmount) : 0n
  const sliderPercentage = maxIncrementalAmount > minIncrementalAmount
    ? Number((incrementalAmountNum - minIncrementalAmount) * 10000n / (maxIncrementalAmount - minIncrementalAmount)) / 100
    : 0

  // Calculate total bet amount (chipsCommitted + incremental) for display
  const totalBetAmount = chipsCommittedNum + incrementalAmountNum
  const remainingBalance = tableBalanceNum - incrementalAmountNum

  // Determine which quick button is selected (if any)
  // Compare incrementalAmount with each quick amount
  const selectedQuickIndex = validQuickAmounts.findIndex((quick) => {
    if (quick.isAllIn) {
      // For all-in, check if incremental amount equals max incremental amount
      return incrementalAmountNum === maxIncrementalAmount
    }
    // For other amounts, compare exact values (quick amounts are already multiples of bigBlind/minimumRaise)
    return incrementalAmountNum === quick.amount && incrementalAmountNum > 0n
  })

  return (
    <div className="bet-raise-dialog-overlay" onClick={onClose}>
      <div className="bet-raise-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="bet-raise-dialog-header">
          <h2>{isBetting ? 'Bet' : 'Raise'}</h2>
          <button className="bet-raise-dialog-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className="bet-raise-dialog-content">
          {error && <div className="bet-raise-error">{error}</div>}

          <div className="bet-raise-amount-section">
            <label htmlFor="bet-amount" className="bet-raise-amount-label">
              {isBetting ? 'Bet Amount' : 'Raise Amount'} (ETH)
            </label>
            <input
              id="bet-amount"
              type="text"
              value={betAmount ? formatEth(BigInt(betAmount)) : ''}
              onChange={(e) => {
                // Parse ETH input and convert to gwei
                const ethValue = parseFloat(e.target.value)
                if (!isNaN(ethValue) && ethValue >= 0) {
                  const gwei = BigInt(Math.floor(ethValue * 1e9))
                  setBetAmount(gwei.toString())
                } else if (e.target.value === '') {
                  setBetAmount('')
                }
              }}
              className="bet-raise-amount-input"
              disabled={isLoading}
              placeholder={formatEth(minIncrementalAmount)}
            />

            <input
              type="range"
              min="0"
              max="100"
              value={sliderPercentage}
              onChange={handleSliderChange}
              className="bet-raise-slider"
              disabled={isLoading}
            />

            <div className="bet-raise-quick-buttons">
              {validQuickAmounts.map((quick, index) => (
                <button
                  key={index}
                  className={`bet-raise-quick-button ${quick.isAllIn ? 'all-in' : ''} ${selectedQuickIndex === index ? 'selected' : ''}`}
                  onClick={() => handleQuickAmountClick(quick.amount)}
                  disabled={isLoading}
                >
                  {quick.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bet-raise-actions">
            <button
              className="bet-raise-button bet-raise-button-cancel"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              className="bet-raise-button bet-raise-button-confirm"
              onClick={handleConfirm}
              disabled={isLoading || !!error || !betAmount}
            >
              {isLoading ? 'Processing...' : (isBetting ? 'Bet' : 'Raise')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

