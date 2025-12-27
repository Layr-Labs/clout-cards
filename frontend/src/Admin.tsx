import './App.css'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { WalletInfo } from './components/WalletInfo'
import { Header } from './components/Header'
import { formatAddress } from './utils/formatAddress'
import { JsonViewerDialog } from './components/JsonViewerDialog'
import { getEvents, type Event } from './services/events'
import { isAdmin, resetLeaderboard, getAccountingSolvency, reprocessEvents, type SolvencyResult, type ReprocessEventsResult } from './services/admin'
import { AddTableDialog } from './components/AddTableDialog'
import { TableSessionsDialog } from './components/TableSessionsDialog'
import { createTable, getPokerTables, updateTableStatus, type PokerTable } from './services/tables'
import { ConfirmDialog } from './components/ConfirmDialog'
import { TableCard } from './components/TableCard'
import { AsyncState } from './components/AsyncState'

/**
 * Admin page component for CloutCards
 *
 * Admin interface for managing the platform. Requires wallet connection to access.
 * Features tab-based navigation for Tables and Metadata management.
 */
function Admin() {
  const { address, isConnected, isLoggedIn, connectWallet, signature } = useWallet()
  const [activeTab, setActiveTab] = useState<'tables' | 'metadata' | 'actions' | 'accounting'>('tables')
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
  const [tableToToggle, setTableToToggle] = useState<PokerTable | null>(null)
  const [isToggleDialogOpen, setIsToggleDialogOpen] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  // Actions tab state
  const [isResetLeaderboardDialogOpen, setIsResetLeaderboardDialogOpen] = useState(false)
  const [isResettingLeaderboard, setIsResettingLeaderboard] = useState(false)
  // Reprocess events state
  const [reprocessFromBlock, setReprocessFromBlock] = useState('')
  const [reprocessToBlock, setReprocessToBlock] = useState('')
  const [reprocessDryRun, setReprocessDryRun] = useState(true)
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<ReprocessEventsResult | null>(null)
  const [reprocessError, setReprocessError] = useState<string | null>(null)
  // Accounting tab state
  const [solvencyData, setSolvencyData] = useState<SolvencyResult | null>(null)
  const [isLoadingSolvency, setIsLoadingSolvency] = useState(false)
  const [solvencyError, setSolvencyError] = useState<string | null>(null)

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
   * Loads solvency data when admin is logged in and accounting tab is active
   */
  useEffect(() => {
    async function loadSolvency() {
      if (!isAdminUser || !isLoggedIn || !signature || !address || activeTab !== 'accounting') {
        return
      }

      setIsLoadingSolvency(true)
      setSolvencyError(null)
      try {
        const data = await getAccountingSolvency(signature, address)
        setSolvencyData(data)
      } catch (error) {
        console.error('Failed to load solvency data:', error)
        setSolvencyError(error instanceof Error ? error.message : 'Failed to load solvency data')
      } finally {
        setIsLoadingSolvency(false)
      }
    }

    loadSolvency()
  }, [isAdminUser, isLoggedIn, signature, address, activeTab])

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

  /**
   * Handles toggling table active status
   */
  async function handleToggleTableStatus() {
    if (!tableToToggle || !address || !signature) {
      return
    }

    setIsTogglingStatus(true)
    try {
      const newStatus = !tableToToggle.isActive
      await updateTableStatus(tableToToggle.id, newStatus, signature, address)

      // Refresh table list after successful update
      const fetchedTables = await getPokerTables()
      setTables(fetchedTables)

      // Close dialog
      setIsToggleDialogOpen(false)
      setTableToToggle(null)
    } catch (error) {
      console.error('Failed to update table status:', error)
      alert(error instanceof Error ? error.message : 'Failed to update table status')
    } finally {
      setIsTogglingStatus(false)
    }
  }

  /**
   * Handles resetting the leaderboard
   * Deletes all leaderboard stats and creates a LEADERBOARD_RESET event
   */
  async function handleResetLeaderboard() {
    if (!address || !signature) {
      return
    }

    setIsResettingLeaderboard(true)
    try {
      const result = await resetLeaderboard(signature, address)
      alert(`Leaderboard reset successfully. ${result.recordsDeleted} records deleted.`)

      // Close dialog
      setIsResetLeaderboardDialogOpen(false)
    } catch (error) {
      console.error('Failed to reset leaderboard:', error)
      alert(error instanceof Error ? error.message : 'Failed to reset leaderboard')
    } finally {
      setIsResettingLeaderboard(false)
    }
  }

  /**
   * Handles reprocessing contract events from a block range
   * Used to catch up on missed deposit/withdrawal events
   */
  async function handleReprocessEvents() {
    if (!address || !signature) {
      return
    }

    // Validate fromBlock
    const fromBlockNum = parseInt(reprocessFromBlock, 10)
    if (isNaN(fromBlockNum) || fromBlockNum < 0) {
      setReprocessError('From Block must be a non-negative integer')
      return
    }

    // Validate toBlock if provided
    let toBlockNum: number | undefined
    if (reprocessToBlock.trim()) {
      toBlockNum = parseInt(reprocessToBlock, 10)
      if (isNaN(toBlockNum) || toBlockNum < 0) {
        setReprocessError('To Block must be a non-negative integer')
        return
      }
      if (toBlockNum < fromBlockNum) {
        setReprocessError('To Block must be greater than or equal to From Block')
        return
      }
    }

    setIsReprocessing(true)
    setReprocessError(null)
    setReprocessResult(null)

    try {
      const result = await reprocessEvents(
        {
          fromBlock: fromBlockNum,
          toBlock: toBlockNum,
          dryRun: reprocessDryRun,
        },
        signature,
        address
      )
      setReprocessResult(result)
    } catch (error) {
      console.error('Failed to reprocess events:', error)
      setReprocessError(error instanceof Error ? error.message : 'Failed to reprocess events')
    } finally {
      setIsReprocessing(false)
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <Header
        navLinks={[
          { to: '/', label: 'Home' },
          { to: '/leaderboard', label: 'Leaderboard' },
          { to: '/verify', label: 'Verify' },
          { href: '/docs/', label: 'Docs' },
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
                    <button
                      className={`admin-tab ${activeTab === 'actions' ? 'active' : ''}`}
                      onClick={() => setActiveTab('actions')}
                    >
                      Actions
                    </button>
                    <button
                      className={`admin-tab ${activeTab === 'accounting' ? 'active' : ''}`}
                      onClick={() => setActiveTab('accounting')}
                    >
                      Accounting
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
                        <AsyncState
                          isLoading={isLoadingTables}
                          error={null}
                          isEmpty={tables.length === 0}
                          emptyMessage='No tables found. Create your first table using the "Add Table" button above.'
                          loadingMessage="Loading tables..."
                          className="admin-tables-state"
                        >
                          <div className="admin-tables-list">
                            {tables.map((table) => (
                              <TableCard
                                key={table.id}
                                table={table}
                                className="admin-table-card"
                                showDetails={true}
                                renderAction={() => (
                                  <div className="admin-table-actions">
                                    <button
                                      className="admin-table-sessions-button"
                                      onClick={() => {
                                        setSelectedTable(table)
                                        setIsSessionsDialogOpen(true)
                                      }}
                                    >
                                      Sessions
                                    </button>
                                    <button
                                      className={`admin-table-toggle-button ${table.isActive ? 'deactivate' : 'activate'}`}
                                      onClick={() => {
                                        setTableToToggle(table)
                                        setIsToggleDialogOpen(true)
                                      }}
                                    >
                                      {table.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                  </div>
                                )}
                              />
                            ))}
                          </div>
                        </AsyncState>
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
                        <AsyncState
                          isLoading={isLoadingEvents}
                          error={null}
                          isEmpty={events.length === 0}
                          emptyMessage="No events found."
                          loadingMessage="Loading events..."
                          className="admin-events-state"
                        >
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
                        </AsyncState>
                      </div>
                    )}

                    {activeTab === 'actions' && (
                      <div className="admin-tab-panel">
                        <div className="admin-tab-header">
                          <div className="admin-tab-header-left">
                            <h2 className="admin-tab-title">Actions</h2>
                            <p className="admin-tab-description">
                              Administrative actions and system operations
                            </p>
                          </div>
                        </div>

                        {/* Actions List */}
                        <div className="admin-actions-list">
                          {/* Reprocess Events Action */}
                          <div className="admin-action-card">
                            <div className="admin-action-card-header">
                              <h3 className="admin-action-card-title">Reprocess Contract Events</h3>
                            </div>
                            <div className="admin-action-card-body">
                              <p className="admin-action-card-description">
                                Query the blockchain for Deposited and WithdrawalExecuted events 
                                from a specific block range. Use this to catch up on missed events 
                                after server downtime or to recover from sync issues.
                              </p>
                              
                              <div className="admin-reprocess-form">
                                <div className="admin-reprocess-inputs">
                                  <div className="admin-reprocess-input-group">
                                    <label htmlFor="fromBlock">From Block *</label>
                                    <input
                                      id="fromBlock"
                                      type="number"
                                      min="0"
                                      value={reprocessFromBlock}
                                      onChange={(e) => setReprocessFromBlock(e.target.value)}
                                      placeholder="e.g. 12345678"
                                      className="admin-reprocess-input"
                                      disabled={isReprocessing}
                                    />
                                  </div>
                                  <div className="admin-reprocess-input-group">
                                    <label htmlFor="toBlock">To Block (optional)</label>
                                    <input
                                      id="toBlock"
                                      type="number"
                                      min="0"
                                      value={reprocessToBlock}
                                      onChange={(e) => setReprocessToBlock(e.target.value)}
                                      placeholder="latest"
                                      className="admin-reprocess-input"
                                      disabled={isReprocessing}
                                    />
                                  </div>
                                </div>
                                
                                <div className="admin-reprocess-checkbox">
                                  <input
                                    id="dryRun"
                                    type="checkbox"
                                    checked={reprocessDryRun}
                                    onChange={(e) => setReprocessDryRun(e.target.checked)}
                                    disabled={isReprocessing}
                                  />
                                  <label htmlFor="dryRun">
                                    Dry Run (preview changes without applying them)
                                  </label>
                                </div>

                                <button
                                  className="admin-action-button admin-action-button-primary"
                                  onClick={handleReprocessEvents}
                                  disabled={isReprocessing || !reprocessFromBlock.trim()}
                                >
                                  {isReprocessing ? 'Processing...' : 'Reprocess Events'}
                                </button>
                              </div>

                              {/* Error display */}
                              {reprocessError && (
                                <div className="admin-reprocess-error">
                                  {reprocessError}
                                </div>
                              )}

                              {/* Results display */}
                              {reprocessResult && (
                                <div className="admin-reprocess-results">
                                  <div className="admin-reprocess-results-header">
                                    <span className={`admin-reprocess-status ${reprocessResult.success ? 'success' : 'error'}`}>
                                      {reprocessResult.success ? '✓ Completed' : '✗ Failed'}
                                    </span>
                                    {reprocessResult.dryRun && (
                                      <span className="admin-reprocess-dry-run-badge">DRY RUN</span>
                                    )}
                                  </div>
                                  
                                  <div className="admin-reprocess-summary">
                                    <div className="admin-reprocess-summary-row">
                                      <span>Block Range:</span>
                                      <span>{reprocessResult.fromBlock.toLocaleString()} - {reprocessResult.toBlock.toLocaleString()}</span>
                                    </div>
                                    <div className="admin-reprocess-summary-row">
                                      <span>Deposits:</span>
                                      <span>
                                        <span className="admin-reprocess-count-processed">{reprocessResult.depositsProcessed} processed</span>
                                        {reprocessResult.depositsSkipped > 0 && (
                                          <span className="admin-reprocess-count-skipped">, {reprocessResult.depositsSkipped} skipped</span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="admin-reprocess-summary-row">
                                      <span>Withdrawals:</span>
                                      <span>
                                        <span className="admin-reprocess-count-processed">{reprocessResult.withdrawalsProcessed} processed</span>
                                        {reprocessResult.withdrawalsSkipped > 0 && (
                                          <span className="admin-reprocess-count-skipped">, {reprocessResult.withdrawalsSkipped} skipped</span>
                                        )}
                                      </span>
                                    </div>
                                    {reprocessResult.errors > 0 && (
                                      <div className="admin-reprocess-summary-row admin-reprocess-summary-errors">
                                        <span>Errors:</span>
                                        <span>{reprocessResult.errors}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Event details table */}
                                  {reprocessResult.events.length > 0 && (
                                    <div className="admin-reprocess-events">
                                      <h4>Event Details</h4>
                                      <table className="admin-reprocess-events-table">
                                        <thead>
                                          <tr>
                                            <th>Type</th>
                                            <th>Block</th>
                                            <th>Player</th>
                                            <th>Amount (ETH)</th>
                                            <th>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {reprocessResult.events.map((event, idx) => (
                                            <tr key={`${event.txHash}-${idx}`}>
                                              <td>
                                                <span className={`admin-reprocess-event-type admin-reprocess-event-type-${event.type}`}>
                                                  {event.type === 'deposit' ? '💰 Deposit' : '💸 Withdrawal'}
                                                </span>
                                              </td>
                                              <td>{event.blockNumber.toLocaleString()}</td>
                                              <td className="admin-reprocess-event-player">
                                                {event.player.slice(0, 6)}...{event.player.slice(-4)}
                                              </td>
                                              <td>{(Number(event.amountGwei) / 1e9).toFixed(6)}</td>
                                              <td>
                                                <span className={`admin-reprocess-event-status admin-reprocess-event-status-${event.status}`}>
                                                  {event.status === 'processed' ? '✓' : event.status === 'skipped' ? '⏭️' : '✗'}
                                                  {' '}{event.status}
                                                  {event.reason && ` (${event.reason})`}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Reset Leaderboard Action */}
                          <div className="admin-action-card">
                            <div className="admin-action-card-header">
                              <h3 className="admin-action-card-title">Reset Leaderboard</h3>
                            </div>
                            <div className="admin-action-card-body">
                              <p className="admin-action-card-description">
                                This action will permanently delete all leaderboard statistics. 
                                All player rankings, win/loss records, and earnings data will be 
                                erased. This action cannot be undone.
                              </p>
                              <button
                                className="admin-action-button admin-action-button-danger"
                                onClick={() => setIsResetLeaderboardDialogOpen(true)}
                                disabled={isResettingLeaderboard}
                              >
                                {isResettingLeaderboard ? 'Resetting...' : 'Reset Leaderboard'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'accounting' && (
                      <div className="admin-tab-panel">
                        <div className="admin-tab-header">
                          <div className="admin-tab-header-left">
                            <h2 className="admin-tab-title">Accounting</h2>
                            <p className="admin-tab-description">
                              Verify solvency by comparing total liabilities to contract balance
                            </p>
                          </div>
                          <button
                            className="admin-refresh-button"
                            onClick={() => {
                              if (!signature || !address) return
                              setIsLoadingSolvency(true)
                              setSolvencyError(null)
                              getAccountingSolvency(signature, address)
                                .then(data => setSolvencyData(data))
                                .catch(err => setSolvencyError(err instanceof Error ? err.message : 'Failed to refresh'))
                                .finally(() => setIsLoadingSolvency(false))
                            }}
                            disabled={isLoadingSolvency || !signature || !address}
                          >
                            {isLoadingSolvency ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>

                        {/* Solvency Status */}
                        <AsyncState
                          isLoading={isLoadingSolvency && !solvencyData}
                          error={solvencyError}
                          isEmpty={false}
                          loadingMessage="Loading solvency data..."
                          className="admin-accounting-state"
                        >
                          {solvencyData && (
                            <div className="admin-accounting-content">
                              {/* Solvency Summary Card */}
                              <div className={`admin-solvency-card ${solvencyData.isSolvent ? 'solvent' : 'insolvent'}`}>
                                <div className="admin-solvency-status">
                                  <span className="admin-solvency-icon">
                                    {solvencyData.isSolvent ? '✓' : '✗'}
                                  </span>
                                  <span className="admin-solvency-label">
                                    {solvencyData.isSolvent ? 'Solvent' : 'INSOLVENT'}
                                  </span>
                                </div>
                                {!solvencyData.isSolvent && solvencyData.shortfallGwei && (
                                  <div className="admin-solvency-shortfall">
                                    Shortfall: {(Number(solvencyData.shortfallGwei) / 1e9).toFixed(9)} ETH
                                  </div>
                                )}
                              </div>

                              {/* Balance Comparison - Primary: Liabilities vs Contract */}
                              <div className="admin-accounting-balances">
                                <div className="admin-accounting-balance-card admin-accounting-balance-card-primary">
                                  <div className="admin-accounting-balance-label">Total Liabilities</div>
                                  <div className="admin-accounting-balance-value">
                                    {(Number(solvencyData.totalLiabilitiesGwei) / 1e9).toFixed(9)} ETH
                                  </div>
                                  <div className="admin-accounting-balance-gwei">
                                    {Number(solvencyData.totalLiabilitiesGwei).toLocaleString()} gwei
                                  </div>
                                  <div className="admin-accounting-balance-breakdown">
                                    = Escrow ({(Number(solvencyData.totalEscrowGwei) / 1e9).toFixed(6)}) + Tables ({(Number(solvencyData.totalTableBalanceGwei) / 1e9).toFixed(6)})
                                  </div>
                                </div>
                                <div className="admin-accounting-balance-divider">vs</div>
                                <div className="admin-accounting-balance-card">
                                  <div className="admin-accounting-balance-label">Contract Balance</div>
                                  <div className="admin-accounting-balance-value">
                                    {(Number(solvencyData.contractBalanceGwei) / 1e9).toFixed(9)} ETH
                                  </div>
                                  <div className="admin-accounting-balance-gwei">
                                    {Number(solvencyData.contractBalanceGwei).toLocaleString()} gwei
                                  </div>
                                </div>
                              </div>

                              {/* Liabilities Breakdown Cards */}
                              <div className="admin-accounting-liabilities-breakdown">
                                <div className="admin-accounting-liability-card">
                                  <div className="admin-accounting-liability-label">Escrow Balances</div>
                                  <div className="admin-accounting-liability-value">
                                    {(Number(solvencyData.totalEscrowGwei) / 1e9).toFixed(9)} ETH
                                  </div>
                                  <div className="admin-accounting-liability-count">
                                    {solvencyData.escrowBreakdown.playerCount} players
                                  </div>
                                </div>
                                <div className="admin-accounting-liability-plus">+</div>
                                <div className="admin-accounting-liability-card">
                                  <div className="admin-accounting-liability-label">Table Balances</div>
                                  <div className="admin-accounting-liability-value">
                                    {(Number(solvencyData.totalTableBalanceGwei) / 1e9).toFixed(9)} ETH
                                  </div>
                                  <div className="admin-accounting-liability-count">
                                    {solvencyData.tableBreakdown.tableCount} tables
                                  </div>
                                </div>
                              </div>

                              {/* Escrow Breakdown */}
                              <div className="admin-accounting-breakdown">
                                <h3 className="admin-accounting-breakdown-title">
                                  Escrow Balances ({solvencyData.escrowBreakdown.playerCount} players)
                                </h3>
                                {solvencyData.escrowBreakdown.players.length === 0 ? (
                                  <p className="admin-accounting-empty">No players with escrow balances.</p>
                                ) : (
                                  <table className="admin-accounting-table">
                                    <thead>
                                      <tr>
                                        <th>Address</th>
                                        <th>Balance (ETH)</th>
                                        <th>Balance (gwei)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {solvencyData.escrowBreakdown.players.map((player) => (
                                        <tr key={player.address}>
                                          <td className="admin-accounting-address">
                                            <code>{formatAddress(player.address)}</code>
                                          </td>
                                          <td className="admin-accounting-eth">
                                            {(Number(player.balanceGwei) / 1e9).toFixed(9)}
                                          </td>
                                          <td className="admin-accounting-gwei">
                                            {Number(player.balanceGwei).toLocaleString()}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* Table Breakdown */}
                              <div className="admin-accounting-breakdown">
                                <h3 className="admin-accounting-breakdown-title">
                                  Table Balances ({solvencyData.tableBreakdown.tableCount} tables)
                                </h3>
                                {solvencyData.tableBreakdown.tables.length === 0 ? (
                                  <p className="admin-accounting-empty">No players sitting at tables.</p>
                                ) : (
                                  solvencyData.tableBreakdown.tables.map((table) => (
                                    <div key={table.tableId} className="admin-accounting-table-section">
                                      <div className="admin-accounting-table-header">
                                        <span className="admin-accounting-table-name">{table.tableName}</span>
                                        <span className="admin-accounting-table-total">
                                          {(Number(table.totalGwei) / 1e9).toFixed(6)} ETH
                                        </span>
                                      </div>
                                      <table className="admin-accounting-table">
                                        <thead>
                                          <tr>
                                            <th>Seat</th>
                                            <th>Address</th>
                                            <th>Stack (ETH)</th>
                                            <th>Stack (gwei)</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {table.players.map((player) => (
                                            <tr key={`${table.tableId}-${player.seatNumber}`}>
                                              <td className="admin-accounting-seat">
                                                {player.seatNumber}
                                              </td>
                                              <td className="admin-accounting-address">
                                                <code>{formatAddress(player.address)}</code>
                                              </td>
                                              <td className="admin-accounting-eth">
                                                {(Number(player.balanceGwei) / 1e9).toFixed(9)}
                                              </td>
                                              <td className="admin-accounting-gwei">
                                                {Number(player.balanceGwei).toLocaleString()}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </AsyncState>
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

      {/* Toggle Table Status Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isToggleDialogOpen}
        onClose={() => {
          setIsToggleDialogOpen(false)
          setTableToToggle(null)
        }}
        onConfirm={handleToggleTableStatus}
        title={tableToToggle?.isActive ? 'Deactivate Table' : 'Activate Table'}
        message={
          tableToToggle?.isActive
            ? `Are you sure you want to deactivate "${tableToToggle.name}"? New hands will not start and chat will be disabled. Players can still complete any active hand and stand up to recover their funds.`
            : `Are you sure you want to activate "${tableToToggle?.name}"? This will allow new hands to start and enable chat.`
        }
        confirmText={tableToToggle?.isActive ? 'Deactivate' : 'Activate'}
        isLoading={isTogglingStatus}
      />

      {/* Reset Leaderboard Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isResetLeaderboardDialogOpen}
        onClose={() => setIsResetLeaderboardDialogOpen(false)}
        onConfirm={handleResetLeaderboard}
        title="Reset Leaderboard"
        message="Are you sure you want to reset the leaderboard? This will permanently delete ALL leaderboard statistics including player rankings, win/loss records, and earnings data. This action CANNOT be undone."
        confirmText="Reset Leaderboard"
        isLoading={isResettingLeaderboard}
      />
    </div>
  )
}

export default Admin

