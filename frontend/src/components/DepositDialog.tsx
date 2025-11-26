import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { useEthBalance } from '../hooks/useEthBalance';
import { getContractAddress } from '../config/contract';
import './DepositDialog.css';

/**
 * CloutCards contract ABI - only the events we need to listen to
 */
const CLOUTCARDS_ABI = [
  'event Deposited(address indexed player, address indexed depositor, uint256 amount)',
] as const;

/**
 * Deposit dialog component
 *
 * Allows users to deposit ETH into their escrow balance.
 * Features a slider to select deposit amount from 0 to wallet balance.
 *
 * @param isOpen - Whether the dialog is visible
 * @param onClose - Callback function called when dialog should be closed
 * @param onDepositSuccess - Callback function called when deposit is successful
 */
export function DepositDialog({
  isOpen,
  onClose,
  onDepositSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDepositSuccess?: () => void;
}) {
  const { address, provider, signature } = useWallet();
  const ethBalance = useEthBalance(address, provider);
  const [depositAmount, setDepositAmount] = useState<string>('0');
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txReceipt, setTxReceipt] = useState<ethers.TransactionReceipt | null>(null);
  const [depositEvent, setDepositEvent] = useState<{
    player: string;
    depositor: string;
    amount: bigint;
  } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const contractRef = useRef<ethers.Contract | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  // Get contract address (from window global or env var)
  const contractAddress = getContractAddress();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setDepositAmount('0');
      setError(null);
      setTxHash(null);
      setTxReceipt(null);
      setDepositEvent(null);
      setIsConfirmed(false);
    } else {
      // Clean up event listener when dialog closes
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      contractRef.current = null;
    }
  }, [isOpen]);

  // Set up contract instance when provider/address changes
  useEffect(() => {
    if (provider && contractAddress && !contractRef.current) {
      contractRef.current = new ethers.Contract(contractAddress, CLOUTCARDS_ABI, provider);
    }
  }, [provider, contractAddress]);

  /**
   * Polls for transaction confirmation and listens for Deposited event
   */
  async function pollForConfirmation(txHash: string) {
    if (!provider || !contractRef.current || !address) {
      return;
    }

    try {
      // Poll for transaction receipt
      let receipt: ethers.TransactionReceipt | null = null;
      const maxAttempts = 150; // 150 attempts = ~5 minutes at 2s intervals
      let attempts = 0;

      while (!receipt && attempts < maxAttempts) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            setTxReceipt(receipt);
            setIsConfirmed(true);
            break;
          }
        } catch (err) {
          // Transaction not yet mined, continue polling
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds (L2)
        attempts++;
      }

      if (!receipt) {
        setError('Transaction confirmation timeout. Please check the transaction manually.');
        return;
      }

      // Query for Deposited events from this transaction
      // Filter by depositor (msg.sender) since we're using receive() hook
      const filter = contractRef.current.filters.Deposited(null, address);
      const events = await contractRef.current.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);

      // Find the event from this transaction
      const foundEvent = events.find(e => e.transactionHash === txHash);
      if (foundEvent && foundEvent.args) {
        setDepositEvent({
          player: foundEvent.args[0] as string,
          depositor: foundEvent.args[1] as string,
          amount: foundEvent.args[2] as bigint,
        });
        setIsDepositing(false);
        // Call success callback
        if (onDepositSuccess) {
          onDepositSuccess();
        }
        return;
      }

      // If event not found in query, set up a listener as fallback
      // This handles cases where the event might be emitted in a future block
      let eventFound = false;
      const listener = (player: string, depositor: string, amount: bigint, event: ethers.Log) => {
        if (event.transactionHash === txHash) {
          eventFound = true;
          setDepositEvent({
            player,
            depositor,
            amount,
          });
          setIsDepositing(false);
          // Clean up listener
          if (contractRef.current && listenerRef.current) {
            listenerRef.current();
            listenerRef.current = null;
          }
          // Call success callback
          if (onDepositSuccess) {
            onDepositSuccess();
          }
        }
      };

      contractRef.current.on('Deposited', listener);
      listenerRef.current = () => {
        if (contractRef.current) {
          contractRef.current.off('Deposited', listener);
        }
      };

      // Set a timeout to stop listening after 2 minutes
      setTimeout(() => {
        if (listenerRef.current) {
          listenerRef.current();
          listenerRef.current = null;
        }
        if (!eventFound) {
          setIsDepositing(false);
          setError('Deposit event not detected. Transaction confirmed but event may be delayed.');
        }
      }, 120000); // 2 minutes

      // Call success callback
      if (onDepositSuccess) {
        onDepositSuccess();
      }
    } catch (err: unknown) {
      console.error('Error polling for confirmation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to confirm transaction';
      setError(errorMessage);
    }
  }

  /**
   * Handles deposit transaction
   */
  async function handleDeposit() {
    if (!address || !provider || !contractAddress) {
      setError('Wallet not connected or contract address not configured');
      return;
    }

    const amountWei = ethers.parseEther(depositAmount);
    if (amountWei === 0n) {
      setError('Deposit amount must be greater than 0');
      return;
    }

    setIsDepositing(true);
    setError(null);
    setTxHash(null);
    setTxReceipt(null);
    setDepositEvent(null);
    setIsConfirmed(false);

    try {
      const signer = await provider.getSigner();
      
      // Call the deposit() function (receive hook) by sending ETH directly
      const tx = await signer.sendTransaction({
        to: contractAddress,
        value: amountWei,
      });

      // Store transaction hash immediately
      setTxHash(tx.hash);

      // Start polling for confirmation and listening for events
      await pollForConfirmation(tx.hash);
    } catch (err: unknown) {
      console.error('Deposit error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to deposit';
      setError(errorMessage);
      setIsDepositing(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  const maxBalance = ethBalance ? parseFloat(ethBalance) : 0;
  const depositAmountNum = parseFloat(depositAmount) || 0;
  const sliderValue = maxBalance > 0 ? (depositAmountNum / maxBalance) * 100 : 0;

  return (
    <div className="deposit-dialog-overlay" onClick={onClose}>
      <div className="deposit-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="deposit-dialog-header">
          <h2>Deposit ETH</h2>
          <button className="deposit-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="deposit-dialog-content">
          {!txHash && (
            <>
              <div className="deposit-balance-info">
                <div className="deposit-balance-label">Available Balance</div>
                <div className="deposit-balance-value">{ethBalance || '0.0000'} ETH</div>
              </div>

              <div className="deposit-amount-section">
                <label className="deposit-amount-label">Deposit Amount (ETH)</label>
                <div className="deposit-slider-container">
                  <input
                    type="range"
                    min="0"
                    max={maxBalance}
                    step="0.0001"
                    value={depositAmountNum}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="deposit-slider"
                    disabled={maxBalance === 0 || isDepositing}
                  />
                  <div className="deposit-slider-labels">
                    <span>0 ETH</span>
                    <span>{maxBalance.toFixed(4)} ETH</span>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  max={maxBalance}
                  step="0.0001"
                  value={depositAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue >= 0 && numValue <= maxBalance) {
                      setDepositAmount(value);
                    } else if (value === '' || value === '0') {
                      setDepositAmount('0');
                    }
                  }}
                  className="deposit-amount-input"
                  disabled={isDepositing}
                />
              </div>
            </>
          )}

          {error && <div className="deposit-error">{error}</div>}

          {/* Transaction Status Section */}
          {txHash && (
            <div className="deposit-tx-status">
              <h3 className="deposit-tx-status-title">Transaction Status</h3>
              
              <div className="deposit-tx-info">
                <div className="deposit-tx-info-row">
                  <span className="deposit-tx-label">Contract Address:</span>
                  <span className="deposit-tx-value deposit-tx-address">{contractAddress}</span>
                </div>
                
                <div className="deposit-tx-info-row">
                  <span className="deposit-tx-label">Transaction Hash:</span>
                  <span className="deposit-tx-value deposit-tx-hash">{txHash}</span>
                </div>

                {isConfirmed && (
                  <div className="deposit-tx-confirmed">
                    <span className="deposit-tx-confirmed-icon">✓</span>
                    <span>Transaction Confirmed</span>
                  </div>
                )}

                {!isConfirmed && txHash && (
                  <div className="deposit-tx-pending">
                    <span className="deposit-tx-pending-spinner">⏳</span>
                    <span>Waiting for confirmation...</span>
                  </div>
                )}

                {depositEvent && (
                  <div className="deposit-event-info">
                    <h4 className="deposit-event-title">Deposit Event</h4>
                    <div className="deposit-event-details">
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Player:</span>
                        <span className="deposit-event-value">{depositEvent.player}</span>
                      </div>
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Depositor:</span>
                        <span className="deposit-event-value">{depositEvent.depositor}</span>
                      </div>
                      <div className="deposit-event-row">
                        <span className="deposit-event-label">Amount:</span>
                        <span className="deposit-event-value deposit-event-amount">
                          {ethers.formatEther(depositEvent.amount)} ETH
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="deposit-actions">
            <button
              className="deposit-button deposit-button-cancel"
              onClick={onClose}
              disabled={isDepositing && !isConfirmed && !depositEvent}
            >
              {isConfirmed || depositEvent ? 'Close' : 'Cancel'}
            </button>
            {!isConfirmed && !depositEvent && (
              <button
                className="deposit-button deposit-button-submit"
                onClick={handleDeposit}
                disabled={depositAmountNum === 0 || maxBalance === 0 || isDepositing}
              >
                {isDepositing ? 'Depositing...' : 'Deposit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

