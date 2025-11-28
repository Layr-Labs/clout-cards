/**
 * Buy In Dialog component
 *
 * Displays a dialog for selecting buy-in amount when joining a poker table.
 * Features a slider to select amount between minimum and maximum buy-in.
 */

import { useState, useEffect } from 'react';
import './BuyInDialog.css';

/**
 * Props for BuyInDialog component
 */
export interface BuyInDialogProps {
  /**
   * Whether the dialog is open
   */
  isOpen: boolean;
  /**
   * Callback when dialog is closed
   */
  onClose: () => void;
  /**
   * Callback when buy-in is confirmed
   * @param buyInAmountGwei - Selected buy-in amount in gwei (as string)
   */
  onConfirm: (buyInAmountGwei: string) => void;
  /**
   * Minimum buy-in amount in gwei (as string)
   */
  minimumBuyInGwei: string;
  /**
   * Maximum buy-in amount in gwei (as string)
   */
  maximumBuyInGwei: string;
  /**
   * Current escrow balance in gwei (as string)
   */
  escrowBalanceGwei: string;
  /**
   * Whether the buy-in action is in progress
   */
  isLoading?: boolean;
}

/**
 * Buy In Dialog component
 *
 * Displays a modal dialog with a slider to select buy-in amount.
 * Shows minimum/maximum buy-in limits and current escrow balance.
 * Validates that selected amount doesn't exceed escrow balance.
 */
export function BuyInDialog({
  isOpen,
  onClose,
  onConfirm,
  minimumBuyInGwei,
  maximumBuyInGwei,
  escrowBalanceGwei,
  isLoading = false,
}: BuyInDialogProps) {
  const minGwei = BigInt(minimumBuyInGwei);
  const maxGwei = BigInt(maximumBuyInGwei);
  const balanceGwei = BigInt(escrowBalanceGwei);
  
  // Calculate effective max (can't exceed balance)
  const effectiveMaxGwei = balanceGwei < maxGwei ? balanceGwei : maxGwei;
  
  // Start with minimum buy-in, or effective max if balance is less than minimum
  const initialBuyIn = balanceGwei < minGwei ? effectiveMaxGwei : minGwei;
  
  const [buyInGwei, setBuyInGwei] = useState<bigint>(initialBuyIn);
  
  // Reset to initial value when dialog opens
  useEffect(() => {
    if (isOpen) {
      const newInitial = balanceGwei < minGwei ? effectiveMaxGwei : minGwei;
      setBuyInGwei(newInitial);
    }
  }, [isOpen, balanceGwei, minGwei, effectiveMaxGwei]);
  
  // Convert gwei to ETH for display
  const buyInEth = Number(buyInGwei) / 1e9;
  const minEth = Number(minGwei) / 1e9;
  const maxEth = Number(maxGwei) / 1e9;
  const balanceEth = Number(balanceGwei) / 1e9;
  const effectiveMaxEth = Number(effectiveMaxGwei) / 1e9;
  
  // Calculate slider percentage (0-100)
  const range = Number(effectiveMaxGwei - minGwei);
  const sliderValue = range > 0 
    ? ((Number(buyInGwei - minGwei) / range) * 100)
    : 0;
  
  /**
   * Handles slider change
   */
  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const percentage = parseFloat(e.target.value);
    const newBuyInGwei = minGwei + BigInt(Math.round((range * percentage) / 100));
    setBuyInGwei(newBuyInGwei);
  }
  
  /**
   * Handles input field change
   */
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const ethValue = parseFloat(e.target.value);
    if (isNaN(ethValue) || ethValue < 0) {
      return;
    }
    
    const gweiValue = BigInt(Math.round(ethValue * 1e9));
    
    // Clamp to valid range
    let clampedGwei = gweiValue;
    if (clampedGwei < minGwei) {
      clampedGwei = minGwei;
    } else if (clampedGwei > effectiveMaxGwei) {
      clampedGwei = effectiveMaxGwei;
    }
    
    setBuyInGwei(clampedGwei);
  }
  
  /**
   * Handles confirm button click
   */
  function handleConfirm() {
    onConfirm(buyInGwei.toString());
  }
  
  if (!isOpen) {
    return null;
  }
  
  const canAfford = balanceGwei >= minGwei;
  const isAtMinimum = buyInGwei === minGwei;
  const isAtMaximum = buyInGwei === effectiveMaxGwei;
  
  return (
    <div className="buy-in-dialog-overlay" onClick={onClose}>
      <div className="buy-in-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="buy-in-dialog-header">
          <h2>Buy In</h2>
          <button 
            className="buy-in-dialog-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        
        <div className="buy-in-dialog-content">
          {!canAfford ? (
            <div className="buy-in-dialog-error">
              <p>Insufficient escrow balance</p>
              <p className="buy-in-dialog-balance">
                Your balance: {balanceEth.toFixed(4)} ETH
              </p>
              <p className="buy-in-dialog-required">
                Minimum required: {minEth.toFixed(4)} ETH
              </p>
            </div>
          ) : (
            <>
              <div className="buy-in-dialog-info">
                <div className="buy-in-dialog-balance-row">
                  <span>Your Balance:</span>
                  <span className="buy-in-dialog-balance-value">
                    {balanceEth.toFixed(4)} ETH
                  </span>
                </div>
                <div className="buy-in-dialog-limits">
                  <span>Min: {minEth.toFixed(4)} ETH</span>
                  <span>Max: {maxEth.toFixed(4)} ETH</span>
                </div>
              </div>
              
              <div className="buy-in-dialog-slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={sliderValue}
                  onChange={handleSliderChange}
                  className="buy-in-dialog-slider"
                  disabled={isLoading || !canAfford}
                />
                <div className="buy-in-dialog-slider-labels">
                  <span className={isAtMinimum ? 'buy-in-dialog-label-active' : ''}>
                    {minEth.toFixed(4)}
                  </span>
                  <span className={isAtMaximum ? 'buy-in-dialog-label-active' : ''}>
                    {effectiveMaxEth.toFixed(4)}
                  </span>
                </div>
              </div>
              
              <div className="buy-in-dialog-amount-input">
                <label htmlFor="buy-in-amount">Buy-In Amount:</label>
                <div className="buy-in-dialog-input-wrapper">
                  <input
                    id="buy-in-amount"
                    type="number"
                    min={minEth}
                    max={effectiveMaxEth}
                    step="0.0001"
                    value={buyInEth.toFixed(4)}
                    onChange={handleInputChange}
                    className="buy-in-dialog-input"
                    disabled={isLoading || !canAfford}
                  />
                  <span className="buy-in-dialog-currency">ETH</span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="buy-in-dialog-actions">
          <button
            className="buy-in-dialog-button buy-in-dialog-button-cancel"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="buy-in-dialog-button buy-in-dialog-button-confirm"
            onClick={handleConfirm}
            disabled={isLoading || !canAfford}
          >
            {isLoading ? 'Joining...' : 'Join Table'}
          </button>
        </div>
      </div>
    </div>
  );
}

