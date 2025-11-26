import { useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { WalletAvatar } from './WalletAvatar'
import { formatAddress } from '../utils/formatAddress'
import { useEthBalance } from '../hooks/useEthBalance'
import './WalletInfo.css'

/**
 * WalletInfo component
 *
 * Displays wallet connection status with avatar, address, optional balance, and disconnect button.
 * Used across multiple pages to show consistent wallet information.
 *
 * @param showBalance - Whether to display ETH balance (default: false)
 * @param onDisconnect - Optional callback when wallet is disconnected
 * @param disconnectButtonClassName - Optional custom class name for disconnect button
 * @param size - Size of the wallet avatar (default: 48)
 */
export function WalletInfo({
  showBalance = false,
  onDisconnect,
  disconnectButtonClassName = 'wallet-info-disconnect-button',
  size = 48,
}: {
  showBalance?: boolean
  onDisconnect?: () => void
  disconnectButtonClassName?: string
  size?: number
}) {
  const { address, isLoggedIn, disconnectWallet, provider } = useWallet()
  const ethBalance = useEthBalance(address, provider)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  /**
   * Handles wallet disconnection
   */
  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectWallet()
      onDisconnect?.()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (!isLoggedIn || !address) {
    return null
  }

  return (
    <div className="wallet-info">
      <WalletAvatar address={address} size={size} />
      <div className="wallet-info-details">
        <div className="wallet-info-address">{formatAddress(address)}</div>
        {showBalance && ethBalance !== null && (
          <div className="wallet-info-balance">{ethBalance} ETH</div>
        )}
      </div>
      <button
        className={disconnectButtonClassName}
        onClick={handleDisconnect}
        disabled={isDisconnecting}
        title="Disconnect wallet"
      >
        {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
      </button>
    </div>
  )
}

