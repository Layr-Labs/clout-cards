import './App.css'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { WalletInfo } from './components/WalletInfo'
import { Header } from './components/Header'
import { formatAddress } from './utils/formatAddress'
import { formatGwei } from './utils/formatGwei'
import { JsonViewerDialog } from './components/JsonViewerDialog'
import { getEvents, type Event } from './services/events'
import { isAdmin } from './services/admin'
import { AddTableDialog } from './components/AddTableDialog'
import { TableSessionsDialog } from './components/TableSessionsDialog'
import { createTable, getPokerTables, type PokerTable } from './services/tables'

/**
 * Admin page component for CloutCards
 *
 * Admin interface for managing the platform. Requires wallet connection to access.
 * Features tab-based navigation for Tables and Metadata management.
 */
function Admin() {
  const { address, isConnected, isLoggedIn, connectWallet, signature } = useWallet()
  const [activeTab, setActiveTab] = useState<'tables' | 'metadata'>('tables')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null)
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false)
  const [tables, setTables] = useState<PokerTable[]>([])
  const [isLoadingTables, setIsLoadingTables] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [selectedJsonPayload, setSelectedJsonPayload] = useState<string | null>(null)
  const [hoveredHash, setHoveredHash] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; isAbove: boolean } | null>(null)
  const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<PokerTable | null>(null)
  const [isSessionsDialogOpen, setIsSessionsDialogOpen] = useState(false)

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
   * Handles wallet disconnection callback
   * Resets admin status when wallet is disconnected
   */
  function handleDisconnect() {
    setIsAdminUser(null) // Reset admin status on disconnect
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

  /**
   * Loads poker tables when admin is logged in
   */
  useEffect(() => {
    async function loadTables() {
      if (!isAdminUser || !isLoggedIn) {
        setTables([])
        return
      }

      setIsLoadingTables(true)
      try {
        const fetchedTables = await getPokerTables()
        setTables(fetchedTables)
      } catch (error) {
        console.error('Failed to load tables:', error)
        // Don't show alert - just log error
      } finally {
        setIsLoadingTables(false)
      }
    }

    loadTables()
  }, [isAdminUser, isLoggedIn])

  /**
   * Loads events when admin is logged in and metadata tab is active
   */
  useEffect(() => {
    async function loadEvents() {
      if (!isAdminUser || !isLoggedIn || !address || !signature || activeTab !== 'metadata') {
        setEvents([])
        return
      }

      setIsLoadingEvents(true)
      try {
        const fetchedEvents = await getEvents(signature, address, 50)
        setEvents(fetchedEvents)
      } catch (error) {
        console.error('Failed to load events:', error)
        // Don't show alert - just log error
      } finally {
        setIsLoadingEvents(false)
      }
    }

    loadEvents()
  }, [isAdminUser, isLoggedIn, address, signature, activeTab])

  /**
   * Handles creating a new table
   */
  async function handleCreateTable(formData: {
    name: string
    minimumBuyIn: string
    maximumBuyIn: string
    perHandRake: string
    maxSeatCount: string
    smallBlind: string
    bigBlind: string
  }) {
    if (!address || !signature) {
      throw new Error('Wallet not connected or not signed in')
    }

    await createTable(
      {
        name: formData.name,
        minimumBuyIn: formData.minimumBuyIn,
        maximumBuyIn: formData.maximumBuyIn,
        perHandRake: parseInt(formData.perHandRake, 10),
        maxSeatCount: parseInt(formData.maxSeatCount, 10),
        smallBlind: formData.smallBlind,
        bigBlind: formData.bigBlind,
        isActive: true,
        adminAddress: address,
      },
      signature
    )

    // Refresh table list after successful creation
    try {
      const fetchedTables = await getPokerTables()
      setTables(fetchedTables)
    } catch (error) {
      console.error('Failed to refresh tables after creation:', error)
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <Header
        navLinks={[
          { to: '/', label: 'Home' },
          { href: '#leaderboard', label: 'Leaderboard' },
          { href: '#docs', label: 'Docs' },
        ]}
        actionButton={
          <Link to="/play" className="header-play-button">Play Now</Link>
        }
      />

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
                <WalletInfo
                  disconnectButtonClassName="admin-disconnect-button"
                  onDisconnect={handleDisconnect}
                  size={48}
                />
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
                          <button
                            className="admin-add-table-button"
                            onClick={() => setIsAddTableDialogOpen(true)}
                          >
                            Add Table
                          </button>
                        </div>

                        {/* Tables List */}
                        {isLoadingTables ? (
                          <div className="admin-tables-loading">
                            <p>Loading tables...</p>
                          </div>
                        ) : tables.length === 0 ? (
                          <div className="admin-tables-empty">
                            <p>No tables found. Create your first table using the "Add Table" button above.</p>
                          </div>
                        ) : (
                          <div className="admin-tables-list">
                            {tables.map((table) => (
                              <div 
                                key={table.id} 
                                className="admin-table-card"
                                onClick={() => {
                                  setSelectedTable(table)
                                  setIsSessionsDialogOpen(true)
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="admin-table-header">
                                  <h3 className="admin-table-name">{table.name}</h3>
                                  <span className={`admin-table-status ${table.isActive ? 'active' : 'inactive'}`}>
                                    {table.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                <div className="admin-table-details">
                                  <div className="admin-table-detail">
                                    <span className="admin-table-label">Buy-In:</span>
                                    <span className="admin-table-value">
                                      {formatGwei(table.minimumBuyIn)} - {formatGwei(table.maximumBuyIn)} gwei
                                    </span>
                                  </div>
                                  <div className="admin-table-detail">
                                    <span className="admin-table-label">Blinds:</span>
                                    <span className="admin-table-value">
                                      {formatGwei(table.smallBlind)} / {formatGwei(table.bigBlind)} gwei
                                    </span>
                                  </div>
                                  <div className="admin-table-detail">
                                    <span className="admin-table-label">Rake:</span>
                                    <span className="admin-table-value">{table.perHandRake} bps</span>
                                  </div>
                                  <div className="admin-table-detail">
                                    <span className="admin-table-label">Seats:</span>
                                    <span className="admin-table-value">{table.maxSeatCount}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'metadata' && (
                      <div className="admin-tab-panel">
                        <div className="admin-tab-header">
                          <div className="admin-tab-header-left">
                            <h2 className="admin-tab-title">Metadata</h2>
                            <p className="admin-tab-description">
                              View recent system events and metadata
                            </p>
                          </div>
                        </div>

                        {/* Events List */}
                        {isLoadingEvents ? (
                          <div className="admin-events-loading">
                            <p>Loading events...</p>
                          </div>
                        ) : events.length === 0 ? (
                          <div className="admin-events-empty">
                            <p>No events found.</p>
                          </div>
                        ) : (
                          <div className="admin-events-list">
                            <table className="admin-events-table">
                              <thead>
                                <tr>
                                  <th>Event ID</th>
                                  <th>Kind</th>
                                  <th>Player</th>
                                  <th>Hash</th>
                                  <th>Signature</th>
                                  <th>Block Time</th>
                                  <th>Payload</th>
                                </tr>
                              </thead>
                              <tbody>
                                {events.map((event) => (
                                  <tr key={event.eventId}>
                                    <td className="admin-event-id">{event.eventId}</td>
                                    <td className="admin-event-kind">
                                      <span className="admin-event-kind-badge">{event.kind}</span>
                                    </td>
                                    <td className="admin-event-player">
                                      {event.player ? formatAddress(event.player) : '-'}
                                    </td>
                                    <td className="admin-event-hash">
                                      <div className="admin-event-hash-container">
                                        <code 
                                          className="admin-event-hash-code" 
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            const hash = event.digest
                                            setHoveredHash(hash)
                                            
                                            // Calculate tooltip position
                                            // Use requestAnimationFrame to ensure DOM is ready
                                            requestAnimationFrame(() => {
                                              const tooltipHeight = 50 // Approximate tooltip height
                                              const tooltipWidth = Math.min(600, hash.length * 7 + 28) // Approximate width based on hash length
                                              const spacing = 8
                                              
                                              let top: number
                                              let left: number
                                              let isAbove: boolean
                                              
                                              // Check if there's enough space above
                                              if (rect.top > tooltipHeight + spacing) {
                                                // Position above
                                                top = rect.top - tooltipHeight - spacing
                                                isAbove = true
                                              } else {
                                                // Position below
                                                top = rect.bottom + spacing
                                                isAbove = false
                                              }
                                              
                                              // Center horizontally, but adjust if it would go off-screen
                                              left = rect.left + rect.width / 2 - tooltipWidth / 2
                                              
                                              // Adjust if tooltip would go off left edge
                                              if (left < 10) {
                                                left = 10
                                              }
                                              
                                              // Adjust if tooltip would go off right edge
                                              if (left + tooltipWidth > window.innerWidth - 10) {
                                                left = window.innerWidth - tooltipWidth - 10
                                              }
                                              
                                              // Ensure tooltip doesn't go off top or bottom
                                              if (top < 10) {
                                                top = rect.bottom + spacing
                                                isAbove = false
                                              }
                                              
                                              if (top + tooltipHeight > window.innerHeight - 10) {
                                                top = rect.top - tooltipHeight - spacing
                                                isAbove = true
                                              }
                                              
                                              setTooltipPosition({ top, left, isAbove })
                                            })
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredHash(null)
                                            setTooltipPosition(null)
                                          }}
                                          onClick={() => {
                                            navigator.clipboard.writeText(event.digest).catch(console.error)
                                          }}
                                        >
                                          {formatAddress(event.digest)}
                                        </code>
                                      </div>
                                    </td>
                                    <td className="admin-event-signature">
                                      <span className={`admin-event-signature-badge ${event.signatureValid ? 'valid' : 'invalid'}`}>
                                        {event.signatureValid ? '✓ Valid' : '✗ Invalid'}
                                      </span>
                                    </td>
                                    <td className="admin-event-time">
                                      {new Date(event.blockTs).toLocaleString()}
                                    </td>
                                    <td className="admin-event-payload">
                                      <button
                                        className="admin-event-payload-button"
                                        onClick={() => setSelectedJsonPayload(event.payloadJson)}
                                        title="View JSON payload"
                                      >
                                        View JSON
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {/* Tooltip rendered with fixed positioning to avoid table clipping */}
                            {hoveredHash && tooltipPosition && (
                              <div 
                                className={`admin-event-hash-tooltip ${tooltipPosition.isAbove ? 'above' : ''}`}
                                style={{
                                  top: `${tooltipPosition.top}px`,
                                  left: `${tooltipPosition.left}px`,
                                }}
                              >
                                {hoveredHash}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </main>

      {/* Add Table Dialog */}
      <AddTableDialog
        isOpen={isAddTableDialogOpen}
        onClose={() => setIsAddTableDialogOpen(false)}
        onCreateTable={handleCreateTable}
      />

      {/* JSON Viewer Dialog */}
      <JsonViewerDialog
        isOpen={selectedJsonPayload !== null}
        onClose={() => setSelectedJsonPayload(null)}
        jsonString={selectedJsonPayload || ''}
        title="Event Payload JSON"
      />

      {/* Table Sessions Dialog */}
      {selectedTable && signature && address && (
        <TableSessionsDialog
          isOpen={isSessionsDialogOpen}
          onClose={() => {
            setIsSessionsDialogOpen(false)
            setSelectedTable(null)
          }}
          tableId={selectedTable.id}
          tableName={selectedTable.name}
          signature={signature}
          adminAddress={address}
        />
      )}
    </div>
  )
}

export default Admin

