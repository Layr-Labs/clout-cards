import './App.css'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { WalletAvatar } from './components/WalletAvatar'
import { formatAddress } from './utils/formatAddress'
import { isAdmin } from './services/admin'

/**
 * Admin page component for CloutCards
 *
 * Admin interface for managing the platform. Requires wallet connection to access.
 * Features tab-based navigation for Tables and Metadata management.
 */
function Admin() {
  const { address, isConnected, isLoggedIn, connectWallet, disconnectWallet } = useWallet()
  const [activeTab, setActiveTab] = useState<'tables' | 'metadata'>('tables')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null)
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false)

  /**
   * Handles wallet connection with error handling
   */
  async function handleConnect() {
    setIsConnecting(true)
    try {
      await connectWallet()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      alert(error instanceof Error ? error.message : 'Failed to connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  /**
   * Handles wallet disconnection
   */
  async function handleDisconnect() {
    setIsDisconnecting(true)
    try {
      await disconnectWallet()
      setIsAdminUser(null) // Reset admin status on disconnect
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    } finally {
      setIsDisconnecting(false)
    }
  }

  /**
   * Checks if the connected wallet is an admin
   * Only checks if wallet is logged in (connected AND has signature)
   */
  useEffect(() => {
    async function checkAdminStatus() {
      if (!isLoggedIn || !address) {
        setIsAdminUser(null)
        return
      }

      setIsCheckingAdmin(true)
      try {
        const adminStatus = await isAdmin(address)
        setIsAdminUser(adminStatus)
      } catch (error) {
        console.error('Failed to check admin status:', error)
        setIsAdminUser(false) // Default to false on error
      } finally {
        setIsCheckingAdmin(false)
      }
    }

    checkAdminStatus()
  }, [isLoggedIn, address])

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          <a href="#docs" className="nav-link">Docs</a>
          <button className="header-play-button">Play Now</button>
        </nav>
      </header>

      {/* Admin Content */}
      <main className="admin-main">
        <div className="admin-container">
          <h1 className="admin-title">Admin</h1>

          {!isLoggedIn ? (
            /* Wallet Not Logged In */
            <div className="admin-connect-section">
              <p className="admin-connect-message">
                {isConnected
                  ? 'Please sign the message to complete login'
                  : 'Connect your wallet to access admin features'}
              </p>
              <button
                className="admin-connect-button"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : isConnected ? 'Sign Message' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            /* Wallet Connected */
            <>
              {/* Wallet Info */}
              <div className="admin-wallet-info">
                <WalletAvatar address={address!} size={48} />
                <span className="admin-wallet-address">{formatAddress(address!)}</span>
                <button
                  className="admin-disconnect-button"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  title="Disconnect wallet"
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>

              {/* Admin Status Check */}
              {isCheckingAdmin ? (
                <div className="admin-status-message">
                  <p>Checking admin status...</p>
                </div>
              ) : isAdminUser === false ? (
                <div className="admin-status-message">
                  <p>Connected Wallet is not an Administrator.</p>
                </div>
              ) : isAdminUser === true ? (
                <>
                  {/* Tabs */}
                  <div className="admin-tabs">
                    <button
                      className={`admin-tab ${activeTab === 'tables' ? 'active' : ''}`}
                      onClick={() => setActiveTab('tables')}
                    >
                      Tables
                    </button>
                    <button
                      className={`admin-tab ${activeTab === 'metadata' ? 'active' : ''}`}
                      onClick={() => setActiveTab('metadata')}
                    >
                      Metadata
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="admin-tab-content">
                    {activeTab === 'tables' && (
                      <div className="admin-tab-panel">
                        <div className="admin-tab-header">
                          <div className="admin-tab-header-left">
                            <h2 className="admin-tab-title">Tables</h2>
                            <p className="admin-tab-description">
                              Manage casino tables and game settings
                            </p>
                          </div>
                          <button className="admin-add-table-button">
                            Add Table
                          </button>
                        </div>
                        {/* Tables content will go here */}
                      </div>
                    )}

                    {activeTab === 'metadata' && (
                      <div className="admin-tab-panel">
                        <h2 className="admin-tab-title">Metadata</h2>
                        <p className="admin-tab-description">
                          View and manage system metadata
                        </p>
                        {/* Metadata content will go here */}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default Admin

