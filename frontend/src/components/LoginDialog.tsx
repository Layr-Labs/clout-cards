import { useState, useEffect } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { WalletInfo } from './WalletInfo'
import { initiateTwitterAuth } from '../services/twitter'
import { useTwitterUser } from '../hooks/useTwitterUser'
import { SiX } from 'react-icons/si'
import './LoginDialog.css'

/**
 * Login dialog component
 *
 * Provides a dialog for users to connect their wallet and Twitter account.
 * Shows connection status for each service and displays a success message
 * when both are connected.
 *
 * @param isOpen - Whether the dialog is visible
 * @param onClose - Callback function called when dialog should be closed
 * @param onLoginSuccess - Callback function called when both wallet and Twitter are connected
 */
export function LoginDialog({
  isOpen,
  onClose,
  onLoginSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onLoginSuccess?: () => void
}) {
  const { isLoggedIn, connectWallet } = useWallet()
  const twitterUser = useTwitterUser()
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [isConnectingTwitter, setIsConnectingTwitter] = useState(false)

  // Check if both are connected and call success callback
  useEffect(() => {
    if (isLoggedIn && twitterUser && onLoginSuccess) {
      // Small delay to show the success banner
      const timer = setTimeout(() => {
        onLoginSuccess()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isLoggedIn, twitterUser, onLoginSuccess])

  /**
   * Handles wallet connection
   */
  async function handleConnectWallet() {
    setIsConnectingWallet(true)
    try {
      await connectWallet()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      alert(error instanceof Error ? error.message : 'Failed to connect wallet')
    } finally {
      setIsConnectingWallet(false)
    }
  }

  /**
   * Handles Twitter connection
   */
  function handleConnectTwitter() {
    setIsConnectingTwitter(true)
    initiateTwitterAuth()
  }

  /**
   * Handles disconnecting Twitter
   */
  function handleDisconnectTwitter() {
    localStorage.removeItem('twitterAccessToken')
    localStorage.removeItem('twitterRefreshToken')
    // Reload to trigger useTwitterUser hook to update
    window.location.reload()
  }

  if (!isOpen) return null

  const bothConnected = isLoggedIn && twitterUser

  return (
    <div className="login-dialog-overlay" onClick={onClose}>
      <div className="login-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="login-dialog-header">
          <h2 className="login-dialog-title">Sign In</h2>
          <button className="login-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="login-dialog-content">
          {/* Wallet Connection */}
          <div className="login-connection-section">
            <h3 className="login-connection-title">Connect Wallet</h3>
            {isLoggedIn ? (
              <div className="login-connection-status">
                <WalletInfo
                  showBalance={true}
                  disconnectButtonClassName="login-disconnect-button login-disconnect-wallet-button"
                  size={48}
                />
              </div>
            ) : (
              <button
                className="login-connect-button"
                onClick={handleConnectWallet}
                disabled={isConnectingWallet}
              >
                {isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>

          {/* Twitter Connection */}
          <div className="login-connection-section">
            <h3 className="login-connection-title">Connect X (Twitter)</h3>
            {twitterUser ? (
              <div className="login-connection-status">
                {twitterUser.profile_image_url ? (
                  <img
                    src={twitterUser.profile_image_url}
                    alt={twitterUser.name}
                    className="login-twitter-avatar"
                  />
                ) : (
                  <div className="login-twitter-avatar-placeholder">
                    {twitterUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="login-connection-info">
                  <div className="login-connection-label">X Connected</div>
                  <div className="login-connection-value">@{twitterUser.username}</div>
                </div>
                <button
                  className="login-disconnect-button"
                  onClick={handleDisconnectTwitter}
                  title="Disconnect X"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                className="login-connect-button login-connect-twitter-button"
                onClick={handleConnectTwitter}
                disabled={isConnectingTwitter}
              >
                {isConnectingTwitter ? (
                  'Connecting...'
                ) : (
                  <>
                    Connect <SiX size={20} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Success Banner */}
          {bothConnected && (
            <div className="login-success-banner">
              ✓ Successfully Logged In!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

