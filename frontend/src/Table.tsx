import './App.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getPokerTables, getTablePlayers, joinTable, standUp, getCurrentHand, watchCurrentHand, playerAction, type PokerTable, type TablePlayer, type CurrentHand } from './services/tables'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { BuyInDialog } from './components/BuyInDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { BetRaiseDialog } from './components/BetRaiseDialog'
import { Chat } from './components/Chat'
import { formatEth } from './utils/formatEth'
import { Card } from './components/Card'
import { useWallet } from './contexts/WalletContext'
import { useTwitterUser } from './hooks/useTwitterUser'
import { useEscrowBalance } from './hooks/useEscrowBalance'
import { useTableEvents } from './hooks/useTableEvents'
import type { TableEvent } from './utils/eventQueue'
import type { JoinTableEventPayload, LeaveTableEventPayload } from './utils/animations'
import { AnimatePresence, motion } from 'framer-motion'
import { FaComments, FaHistory } from 'react-icons/fa'
import { sendChatMessage, type ChatMessage } from './services/chat'
import { HandHistory } from './components/HandHistory'

/**
 * Balance display component with count-up animation
 *
 * Animates the balance from 0 to the target amount when a player joins.
 *
 * @param balance - Current formatted balance (e.g., "1.5 ETH")
 * @param isAnimating - Whether the count-up animation should play
 * @param targetAmount - Target balance in gwei (for count-up animation)
 */
function BalanceDisplay({ 
  balance, 
  isAnimating, 
  targetAmount,
  animateFromZero = false
}: { 
  balance: string
  isAnimating: boolean
  targetAmount?: string
  animateFromZero?: boolean
}) {
  // Start at 0 if animating from zero (join), otherwise use current balance
  const [displayBalance, setDisplayBalance] = useState(
    isAnimating && targetAmount && animateFromZero ? '0 ETH' : balance
  )
  const [hasStartedAnimating, setHasStartedAnimating] = useState(false)

  useEffect(() => {
    if (isAnimating && targetAmount && !hasStartedAnimating) {
      // Set initial display balance based on animateFromZero flag
      if (animateFromZero) {
        setDisplayBalance('0 ETH')
      } else {
        // Start from current balance
        setDisplayBalance(balance)
      }
      setHasStartedAnimating(true)
      
      // Delay animation start (only for join_table, not for balance updates)
      const delay = animateFromZero ? 800 : 0
      
      setTimeout(() => {
        const targetEth = formatEth(targetAmount)
        // Extract numeric values from formatted strings
        const startValue = animateFromZero 
          ? 0 
          : (parseFloat(balance.replace(/[^0-9.]/g, '')) || 0)
        const endValue = parseFloat(targetEth.replace(/[^0-9.]/g, '')) || 0
        // Use longer duration for balance decreases (animating down) to make it more visible
        const isDecreasing = endValue < startValue
        const duration = isDecreasing ? 1000 : 500
        const startTime = Date.now()

        const animate = () => {
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          // Ease-out cubic for smooth deceleration
          const eased = 1 - Math.pow(1 - progress, 3)
          const currentValue = startValue + (endValue - startValue) * eased
          // Format the current value as ETH (simple formatting for animation)
          const formatted = currentValue.toFixed(4).replace(/\.?0+$/, '') + ' ETH'
          setDisplayBalance(formatted)
          
          if (progress < 1) {
            requestAnimationFrame(animate)
          } else {
            // Ensure final value matches exactly
            setDisplayBalance(targetEth)
          }
        }

        requestAnimationFrame(animate)
      }, delay)
    } else if (!isAnimating) {
      // Reset when not animating
      setHasStartedAnimating(false)
      setDisplayBalance(balance)
    }
  }, [isAnimating, targetAmount, balance, hasStartedAnimating, animateFromZero])

  return <div className="table-seat-stack">{displayBalance}</div>
}

/**
 * Action timeout countdown component
 *
 * Displays a countdown timer above the player avatar when it's their turn.
 *
 * @param timeoutAt - ISO timestamp when the timeout expires
 * @returns JSX element displaying the countdown in seconds, or null if timeout is invalid
 */
function ActionTimeoutCountdown({ timeoutAt }: { timeoutAt: string | null }) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!timeoutAt) {
      setSecondsRemaining(null)
      return
    }

    const updateCountdown = () => {
      const now = Date.now()
      const timeout = new Date(timeoutAt).getTime()
      const remaining = Math.max(0, Math.floor((timeout - now) / 1000))
      setSecondsRemaining(remaining)
    }

    // Update immediately
    updateCountdown()

    // Update every second
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [timeoutAt])

  if (secondsRemaining === null || secondsRemaining <= 0) {
    return null
  }

  return (
    <div className="table-seat-action-timeout">
      {secondsRemaining}s
    </div>
  )
}

/**
 * Table page component for CloutCards
 *
 * Displays a specific poker table with its active players.
 * Features the same header as the Play page.
 */
function Table() {
  const { id } = useParams<{ id: string }>()
  const [table, setTable] = useState<PokerTable | null>(null)
  const [players, setPlayers] = useState<TablePlayer[]>([])
  const [currentHand, setCurrentHand] = useState<CurrentHand | null>(null)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isBuyInDialogOpen, setIsBuyInDialogOpen] = useState(false)
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isStandUpConfirmOpen, setIsStandUpConfirmOpen] = useState(false)
  const [isStandingUp, setIsStandingUp] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isBetRaiseDialogOpen, setIsBetRaiseDialogOpen] = useState(false)
  const [animatingBalance, setAnimatingBalance] = useState<{ seatNumber: number; targetAmount: string; animateFromZero?: boolean } | null>(null)
  const [joiningSeats, setJoiningSeats] = useState<Set<number>>(new Set())
  const [leavingSeats, setLeavingSeats] = useState<Set<number>>(new Set())
  const [actionAnimation, setActionAnimation] = useState<{
    actionType: 'BET' | 'RAISE' | 'CALL' | 'ALL_IN' | 'CHECK' | 'FOLD'
    playerAvatarUrl: string | null
    playerHandle: string | null
    amount: string | null
  } | null>(null)
  const [showNewHandMessage, setShowNewHandMessage] = useState(false)
  const [handStartCountdown, setHandStartCountdown] = useState<number | null>(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdownExiting, setCountdownExiting] = useState(false)
  const [showTableClosed, setShowTableClosed] = useState(false)
  const [updatingPotNumbers, setUpdatingPotNumbers] = useState<Set<number>>(new Set())
  const previousPotAmountsRef = useRef<Map<number, string>>(new Map())
  const seatRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [winnerSeats, setWinnerSeats] = useState<Set<number>>(new Set())
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownDisplayTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const isChatOpenRef = useRef(false)
  
  // Hand history state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  
  // Mobile detection state
  const [isMobile, setIsMobile] = useState(false)
  
  // Track window size for mobile layout
  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 768)
    }
    
    // Check on mount
    checkMobile()
    
    // Listen for resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const { address, signature, isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const escrowBalanceState = useEscrowBalance()

  const tableId = id ? parseInt(id, 10) : null
  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address && !!signature
  const escrowBalanceGwei = escrowBalanceState?.balanceGwei || '0'

  // Keep ref in sync with chat open state for use in event handler
  useEffect(() => {
    isChatOpenRef.current = isChatOpen
  }, [isChatOpen])

  // Reset unread count when chat opens
  useEffect(() => {
    if (isChatOpen) {
      setUnreadChatCount(0)
    }
  }, [isChatOpen])

  /**
   * Calculates seat positions around an oval table
   * 
   * Uses tighter radii on mobile to prevent overlap and ensure all seats
   * fit within the viewport.
   * 
   * @param seatCount - Number of seats around the table
   * @returns Array of {x, y} positions as percentages (0-100)
   */
  function calculateSeatPositions(seatCount: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = []
    
    // Oval table dimensions (as percentages of container)
    // Use tighter radii on mobile to prevent overlap
    const radiusX = isMobile ? 38 : 45 // horizontal radius
    const radiusY = isMobile ? 30 : 35 // vertical radius
    const centerX = 50
    const centerY = isMobile ? 45 : 50 // Shift up slightly on mobile for action bar
    
    // For corner positions (diagonal), extend radius further out
    // Use smaller multiplier on mobile
    const cornerRadiusMultiplier = isMobile ? 1.08 : 1.15
    
    for (let i = 0; i < seatCount; i++) {
      // Calculate angle for each seat (evenly distributed)
      const angle = (i / seatCount) * 2 * Math.PI - Math.PI / 2 // Start from top (-90 degrees)
      
      // For 8 seats, check if this is a corner position (diagonal seats)
      // With 8 seats evenly spaced, corners are at indices 1, 3, 5, 7 (45° offsets)
      const isCorner = seatCount === 8 && i % 2 === 1
      
      // Use extended radius for corners to position them over the railing
      const effectiveRadiusX = isCorner ? radiusX * cornerRadiusMultiplier : radiusX
      const effectiveRadiusY = isCorner ? radiusY * cornerRadiusMultiplier : radiusY
      
      // Calculate position on ellipse
      const x = centerX + effectiveRadiusX * Math.cos(angle)
      const y = centerY + effectiveRadiusY * Math.sin(angle)
      
      positions.push({ x, y })
    }
    
    return positions
  }

  /**
   * Loads table information from the API and starts countdown if waiting for hand
   */
  useEffect(() => {
    if (!tableId || isNaN(tableId)) {
      return
    }

    async function loadTableData() {
      try {
        // Fetch table info to get the name
        const tables = await getPokerTables()
        const foundTable = tables.find(t => t.id === tableId)
        
        if (foundTable) {
        setTable(foundTable)

          // Check if we should show countdown or table closed (waiting for next hand)
          // Only if: no active hand AND we have a lastHandCompletedAt
          if (!foundTable.hasActiveHand && foundTable.lastHandCompletedAt) {
            // If table is inactive, show "TABLE CLOSED" instead of countdown
            if (!foundTable.isActive) {
              console.log('[Table] loadTableData: table is inactive, showing TABLE CLOSED')
              setShowTableClosed(true)
              setShowCountdown(false)
              setHandStartCountdown(null)
            } else {
              // Table is active, check if we're within the countdown window
              const completedAt = new Date(foundTable.lastHandCompletedAt)
              const delaySeconds = foundTable.handStartDelaySeconds || 30
              const targetTime = completedAt.getTime() + (delaySeconds * 1000)
              const now = Date.now()
              const remaining = Math.ceil((targetTime - now) / 1000)

              // Only show countdown if we're still within the delay window
              if (remaining > 0) {
                console.log('[Table] loadTableData: starting countdown from initial load', { remaining, delaySeconds })
                
                // Set up countdown (same logic as hand_end handler)
                setHandStartCountdown(remaining)
                
                // Show countdown immediately since this is a page reload
                setShowCountdown(true)
                setShowTableClosed(false)
                
                // Clear any existing interval
                if (countdownIntervalRef.current) {
                  clearInterval(countdownIntervalRef.current)
                }
                
                // Update countdown every second
                countdownIntervalRef.current = setInterval(() => {
                  const now = Date.now()
                  const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000))
                  setHandStartCountdown(remaining)
                  
                  if (remaining <= 0) {
                    if (countdownIntervalRef.current) {
                      clearInterval(countdownIntervalRef.current)
                      countdownIntervalRef.current = null
                    }
                    // Trigger exit animation
                    setCountdownExiting(true)
                    setTimeout(() => {
                      setHandStartCountdown(null)
                      setShowCountdown(false)
                      setCountdownExiting(false)
                    }, 500)
                  }
                }, 1000) as any
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load table data:', err)
      }
    }

    loadTableData()
  }, [tableId])

  /**
   * Initial hydration: Load players once on mount
   * After this, players list is updated via SSE events (join_table/leave_table)
   */
  useEffect(() => {
    if (!tableId || isNaN(tableId)) {
      return
    }

    async function loadInitialPlayers() {
      try {
        const fetchedPlayers = await getTablePlayers(tableId!)
        setPlayers(fetchedPlayers)
      } catch (err) {
        console.error('Failed to load initial players:', err)
      }
    }

    loadInitialPlayers()
    // No polling - SSE events will update players list
  }, [tableId])

  /**
   * Initial hydration: Load current hand state once on mount
   * This provides the initial state and lastEventId for SSE connection
   */
  useEffect(() => {
    if (!tableId) {
      setCurrentHand(null)
      return
    }

    // Only load hand if there are at least 2 players
    if (players.length < 2) {
      setCurrentHand(null)
      return
    }

    async function loadInitialHand() {
      try {
        // Read wallet auth from localStorage as fallback (same as hand_start handler)
        const savedAddress = address || localStorage.getItem('walletAddress')
        const savedSignature = signature || localStorage.getItem('walletSignature')
        const hasWalletAuth = savedAddress && savedSignature
        
        // Use getCurrentHand if we have wallet auth (to get hole cards), otherwise use public endpoint
        if (hasWalletAuth) {
          console.log('[Table] loadInitialHand: fetching with wallet auth', {
            address: savedAddress ? `${savedAddress.substring(0, 10)}...` : null,
            signature: savedSignature ? `${savedSignature.substring(0, 10)}...` : null,
          })
          const hand = await getCurrentHand(tableId!, savedAddress, savedSignature)
          console.log('[Table] loadInitialHand: received hand from API', {
            handId: hand.handId,
            currentActionSeat: hand.currentActionSeat,
            actionTimeoutAt: hand.actionTimeoutAt,
            status: hand.status,
          })
          setCurrentHand(hand)
        } else {
          // Public endpoint - no authentication required (no hole cards)
          console.log('[Table] loadInitialHand: fetching without auth (public endpoint)')
          const hand = await watchCurrentHand(tableId!)
          console.log('[Table] loadInitialHand: received hand from public API', {
            handId: hand.handId,
            currentActionSeat: hand.currentActionSeat,
            actionTimeoutAt: hand.actionTimeoutAt,
            status: hand.status,
          })
          setCurrentHand(hand)
        }
      } catch (err: any) {
        // 404 is expected when no hand is active
        if (err?.status !== 404) {
          console.error('Failed to load initial hand:', err)
        }
        setCurrentHand(null)
      }
    }

    loadInitialHand()
  }, [tableId, isFullyLoggedIn, address, signature, players.length])

  // Track pot amount changes and trigger update animations
  useEffect(() => {
    if (!currentHand || !currentHand.pots) return

    const currentPotAmounts = new Map<number, string>()
    const newlyUpdating = new Set<number>()

    // Check each pot for amount changes
    currentHand.pots.forEach((pot) => {
      const currentAmount = pot.amount
      const previousAmount = previousPotAmountsRef.current.get(pot.potNumber)
      
      currentPotAmounts.set(pot.potNumber, currentAmount)
      
      // If amount changed and pot already existed, trigger update animation
      if (previousAmount !== undefined && previousAmount !== currentAmount) {
        newlyUpdating.add(pot.potNumber)
        // Remove the updating class after animation completes
        setTimeout(() => {
          setUpdatingPotNumbers((prev) => {
            const next = new Set(prev)
            next.delete(pot.potNumber)
            return next
          })
        }, 600)
      }
    })

    // Remove pots that no longer exist
    previousPotAmountsRef.current.forEach((_, potNumber) => {
      if (!currentPotAmounts.has(potNumber)) {
        previousPotAmountsRef.current.delete(potNumber)
      }
    })

    // Update ref with current amounts
    previousPotAmountsRef.current = currentPotAmounts

    // Trigger animations for changed pots
    if (newlyUpdating.size > 0) {
      setUpdatingPotNumbers((prev) => {
        const next = new Set(prev)
        newlyUpdating.forEach((potNumber) => next.add(potNumber))
        return next
      })
    }
  }, [currentHand?.pots])

  // Cleanup countdown interval and timeout on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      if (countdownDisplayTimeoutRef.current) {
        clearTimeout(countdownDisplayTimeoutRef.current)
        countdownDisplayTimeoutRef.current = null
      }
    }
  }, [])

  /**
   * Unified handler for updating player balances from event payloads
   *
   * Processes balance updates consistently across all event types (hand_start, hand_action, hand_end).
   * Updates the players state and triggers balance animations when balances change.
   *
   * @param playerBalances - Array of player balance objects with seatNumber and tableBalanceGwei
   */
  const updatePlayerBalances = useCallback((playerBalances: Array<{ seatNumber: number; tableBalanceGwei: string }>) => {
    if (!playerBalances || playerBalances.length === 0) {
      return;
    }

    console.log('[Table] updatePlayerBalances: processing balance updates', {
      playerBalances: playerBalances.map(pb => ({ seatNumber: pb.seatNumber, tableBalanceGwei: pb.tableBalanceGwei })),
    });

    // Collect balance changes to trigger animations after state update
    const balanceChanges: Array<{ seatNumber: number; newBalance: string }> = [];

    setPlayers((prevPlayers) => {
      console.log('[Table] updatePlayerBalances setPlayers: prevPlayers', prevPlayers.map(p => ({ seatNumber: p.seatNumber, tableBalanceGwei: p.tableBalanceGwei })));

      const updatedPlayers = prevPlayers.map((p) => {
        const payloadBalance = playerBalances.find((pb) => pb.seatNumber === p.seatNumber);

        // Update balance if found in payload
        if (payloadBalance && payloadBalance.tableBalanceGwei !== undefined) {
          const newBalance = payloadBalance.tableBalanceGwei;
          const oldBalance = p.tableBalanceGwei;

          console.log('[Table] updatePlayerBalances setPlayers: updating balance', {
            seatNumber: p.seatNumber,
            oldBalance,
            newBalance,
            willAnimate: newBalance !== oldBalance,
          });

          // Track balance change for animation
          if (newBalance !== oldBalance) {
            balanceChanges.push({ seatNumber: p.seatNumber, newBalance });
          }

          return { ...p, tableBalanceGwei: newBalance };
        }

        return p;
      });

      console.log('[Table] updatePlayerBalances setPlayers: updatedPlayers', updatedPlayers.map(p => ({ seatNumber: p.seatNumber, tableBalanceGwei: p.tableBalanceGwei })));
      return updatedPlayers;
    });

    // Trigger animations after state update
    balanceChanges.forEach(({ seatNumber, newBalance }) => {
      setAnimatingBalance({
        seatNumber,
        targetAmount: newBalance,
        animateFromZero: false,
      });
    });
  }, []);

  /**
   * Event handler for SSE events
   * Updates state based on event type
   */
  const handleEvent = useCallback(async (event: TableEvent) => {
    const payload = event.payload
    const kind = payload.kind

    try {
      switch (kind) {
        case 'hand_start': {
          // Clear winner seats when new hand starts
          setWinnerSeats(new Set())
          
          // Clear countdown timer and display delay
          setHandStartCountdown(null)
          setShowCountdown(false)
          setCountdownExiting(false)
          setShowTableClosed(false)
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
          }
          if (countdownDisplayTimeoutRef.current) {
            clearTimeout(countdownDisplayTimeoutRef.current)
            countdownDisplayTimeoutRef.current = null
          }
          
          // Show "NEW HAND" message animation
          setShowNewHandMessage(true)
          setTimeout(() => {
            setShowNewHandMessage(false)
          }, 1500) // Same duration as action animation
          
          console.log('[Table] hand_start event received', {
            eventId: event.eventId,
            payload: payload,
            handData: payload.hand,
            players: payload.players,
          })

          // Update hand state from event payload
          // Event payload contains: table, hand (with id, dealerPosition, smallBlindSeat, currentActionSeat, etc.), players
          const handData = payload.hand as any
          const playersData = (payload.players as any[]) || []
          
          // Create updated hand state
          const updatedHand: CurrentHand = {
            handId: handData.id,
            status: handData.status || 'ACTIVE',
            round: handData.round || null,
            communityCards: [],
            players: playersData.map((p: any) => ({
              seatNumber: p.seatNumber,
              walletAddress: p.walletAddress,
              twitterHandle: null, // Will be updated from players list
              twitterAvatarUrl: null, // Will be updated from players list
              status: p.status || 'ACTIVE',
              chipsCommitted: p.chipsCommitted?.toString() || '0',
              holeCards: null, // Hole cards not in event - will fetch below
            })),
            pots: [],
            dealerPosition: handData.dealerPosition ?? null,
            smallBlindSeat: handData.smallBlindSeat ?? null,
            bigBlindSeat: handData.bigBlindSeat ?? null,
            currentActionSeat: handData.currentActionSeat ?? null,
            actionTimeoutAt: handData.actionTimeoutAt ?? null,
            currentBet: handData.currentBet?.toString() || null,
            lastRaiseAmount: handData.lastRaiseAmount?.toString() || null,
            lastEventId: event.eventId,
          }

          console.log('[Table] hand_start: created updatedHand', {
            currentActionSeat: updatedHand.currentActionSeat,
            players: updatedHand.players.map(p => ({
              seatNumber: p.seatNumber,
              status: p.status,
              walletAddress: p.walletAddress,
            })),
          })

          // Merge with existing hand to preserve Twitter info and other fields
          setCurrentHand((prev) => {
            if (!prev) {
              console.log('[Table] hand_start: no previous hand, setting new hand')
              return updatedHand
            }
            
            console.log('[Table] hand_start: merging with previous hand', {
              prevCurrentActionSeat: prev.currentActionSeat,
              newCurrentActionSeat: updatedHand.currentActionSeat,
            })
            
            // Merge players with Twitter info from previous state
            const mergedPlayers = updatedHand.players.map((p) => {
              const prevPlayer = prev.players.find(pp => pp.seatNumber === p.seatNumber)
              return {
                ...p,
                twitterHandle: prevPlayer?.twitterHandle || null,
                twitterAvatarUrl: prevPlayer?.twitterAvatarUrl || null,
              }
            })
            
            return {
              ...updatedHand,
              players: mergedPlayers,
            }
          })

          // Update table balances for players from the hand_start event
          // This is needed because blinds are deducted when the hand starts
          // Use standardized playerBalances field, fall back to players for backward compatibility
          const balanceData = (payload.playerBalances as any[]) || playersData.map((p: any) => ({
            seatNumber: p.seatNumber,
            tableBalanceGwei: p.tableBalanceGwei,
          }));
          updatePlayerBalances(balanceData);

          // Fetch current hand to get hole cards for authorized player
          // Only need wallet authentication (not Twitter) for hole cards
          // Read directly from localStorage as fallback since WalletContext may not be initialized yet
          const savedAddress = address || localStorage.getItem('walletAddress')
          const savedSignature = signature || localStorage.getItem('walletSignature')
          const hasWalletAuth = savedAddress && savedSignature
          
          console.log('[Table] hand_start: checking conditions for getCurrentHand', {
            isLoggedIn,
            isFullyLoggedIn,
            addressFromHook: address ? `${address.substring(0, 10)}...` : null,
            signatureFromHook: signature ? `${signature.substring(0, 10)}...` : null,
            addressFromStorage: savedAddress ? `${savedAddress.substring(0, 10)}...` : null,
            signatureFromStorage: savedSignature ? `${savedSignature.substring(0, 10)}...` : null,
            tableId,
            hasWalletAuth,
            allConditionsMet: !!(hasWalletAuth && tableId),
          })
          
          if (hasWalletAuth && tableId) {
            try {
              console.log('[Table] hand_start: fetching hole cards', { 
                tableId, 
                address: savedAddress,
                signature: savedSignature ? `${savedSignature.substring(0, 10)}...` : null,
                isFullyLoggedIn,
              })
              // TypeScript: hasWalletAuth check ensures both are non-null
              if (!savedAddress || !savedSignature) {
                throw new Error('Missing wallet authentication')
              }
              const handWithHoleCards = await getCurrentHand(tableId, savedAddress, savedSignature)
              console.log('[Table] hand_start: received handWithHoleCards', {
                handId: handWithHoleCards.handId,
                status: handWithHoleCards.status,
                currentActionSeat: handWithHoleCards.currentActionSeat,
                players: handWithHoleCards.players.map(p => ({
                  seatNumber: p.seatNumber,
                  status: p.status,
                  walletAddress: p.walletAddress,
                  isAuthorizedPlayer: p.walletAddress.toLowerCase() === savedAddress?.toLowerCase(),
                  hasHoleCards: !!p.holeCards,
                  holeCardsCount: p.holeCards ? p.holeCards.length : 0,
                  holeCards: p.holeCards,
                })),
              })
              
              // Merge hole cards into existing hand state (preserve Twitter info and other merged data)
              setCurrentHand((prev) => {
                if (!prev) return handWithHoleCards
                
                // Merge players: use hole cards from API response, but preserve Twitter info from prev state
                const mergedPlayers = handWithHoleCards.players.map((apiPlayer) => {
                  const prevPlayer = prev.players.find(pp => pp.seatNumber === apiPlayer.seatNumber)
                  return {
                    ...apiPlayer,
                    twitterHandle: prevPlayer?.twitterHandle || apiPlayer.twitterHandle || null,
                    twitterAvatarUrl: prevPlayer?.twitterAvatarUrl || apiPlayer.twitterAvatarUrl || null,
                  }
                })
                
                return {
                  ...handWithHoleCards,
                  players: mergedPlayers,
                  // Preserve actionTimeoutAt from event (prev state) if it exists, otherwise use API response
                  actionTimeoutAt: prev.actionTimeoutAt || handWithHoleCards.actionTimeoutAt,
                }
              })
            } catch (err: any) {
              // If fetch fails, continue with state from event
              console.error('[Table] hand_start: Failed to fetch hole cards:', err)
            }
          }
          break
        }

        case 'hand_action': {
          console.log('[Table] hand_action event received', {
            eventId: event.eventId,
            fullPayload: payload,
            actionData: payload.action,
            handData: payload.hand,
            pots: payload.pots,
          })

          // Update player action state
          // Event payload contains: table, hand, pots, action (with walletAddress, type: 'BET'|'RAISE'|'CALL'|'FOLD'|'ALL_IN', amount, etc.)
          const handData = payload.hand as any
          const actionData = payload.action as any
          const potsData = (payload.pots as any[]) || []
          const actionType = actionData?.type as string
          const playerWalletAddress = actionData?.walletAddress?.toLowerCase() || ''
          
          console.log('[Table] hand_action: parsed data', {
            actionType,
            playerWalletAddress,
            seatNumber: actionData?.seatNumber,
            amount: actionData?.amount,
            tableBalanceGwei: actionData?.tableBalanceGwei,
            actionDataKeys: Object.keys(actionData || {}),
          })
          
          // Trigger animation for BET, RAISE, CALL, ALL_IN, CHECK, and FOLD actions
          if (actionType === 'BET' || actionType === 'RAISE' || actionType === 'CALL' || actionType === 'ALL_IN' || actionType === 'CHECK' || actionType === 'FOLD') {
            // CHECK and FOLD have no amount, others use the amount from the action
            const amount = (actionType === 'CHECK' || actionType === 'FOLD') ? null : (actionData?.amount || actionData?.chipsCommitted || null)
            
            setActionAnimation({
              actionType: actionType === 'ALL_IN' ? 'ALL_IN' : (actionType === 'CHECK' ? 'CHECK' : (actionType === 'FOLD' ? 'FOLD' : (actionType as 'BET' | 'RAISE' | 'CALL'))),
              playerAvatarUrl: null,
              playerHandle: null,
              amount: amount ? formatEth(amount) : null,
            })
            
            // Clear animation after it completes (swipe in ~0.5s + hold ~0.5s + swipe out ~0.5s = ~1.5s total)
            setTimeout(() => {
              setActionAnimation(null)
            }, 1500)
          }
          
          // Update table balances using standardized playerBalances field
          // Fall back to action.tableBalanceGwei for backward compatibility
          const balanceData = (payload.playerBalances as any[]) || 
            (actionData?.tableBalanceGwei && actionData?.seatNumber !== undefined
              ? [{ seatNumber: actionData.seatNumber, tableBalanceGwei: actionData.tableBalanceGwei }]
              : []);
          updatePlayerBalances(balanceData);

          setCurrentHand((prev) => {
            if (!prev) return prev

            // Update player status and chips committed
            const updatedPlayers = prev.players.map((p) => {
              if (p.walletAddress.toLowerCase() === playerWalletAddress) {
                return {
                  ...p,
                  status: actionData?.status || p.status,
                  chipsCommitted: actionData?.chipsCommitted?.toString() || p.chipsCommitted,
                }
              }
              return p
            })

            return {
              ...prev,
              players: updatedPlayers,
              pots: potsData.map((pot: any) => ({
                potNumber: pot.potNumber,
                amount: pot.amount?.toString() || '0',
                eligibleSeatNumbers: pot.eligibleSeatNumbers || pot.winnerSeatNumbers || [],
              })),
              currentActionSeat: handData?.currentActionSeat ?? prev.currentActionSeat,
              actionTimeoutAt: handData?.actionTimeoutAt ?? prev.actionTimeoutAt,
              currentBet: handData?.currentBet?.toString() || prev.currentBet,
              lastRaiseAmount: handData?.lastRaiseAmount?.toString() || prev.lastRaiseAmount,
              lastEventId: event.eventId,
            }
          })
          break
        }

        case 'community_cards': {
          // Update community cards
          // Event payload contains: table, hand, communityCards (new cards only), allCommunityCards (all cards)
          // When community cards are dealt, a new betting round starts, so reset currentBet and lastRaiseAmount
          const handData = payload.hand as any
          const allCommunityCards = (payload.allCommunityCards as any[]) || []

          setCurrentHand((prev) => {
            if (!prev) return prev

            return {
              ...prev,
              communityCards: allCommunityCards.map((card: any) => ({
                suit: card.suit,
                rank: card.rank,
              })),
              round: handData.round || prev.round,
              currentActionSeat: handData.currentActionSeat ?? prev.currentActionSeat,
              actionTimeoutAt: handData.actionTimeoutAt ?? prev.actionTimeoutAt,
              currentBet: '0', // Reset to 0 for new betting round
              lastRaiseAmount: null, // Reset to null for new betting round
              lastEventId: event.eventId,
            }
          })
          break
        }

        case 'hand_end': {
          // Update hand end state and reveal all hole cards
          // Event payload contains: table, hand (with winnerSeatNumbers, totalPotAmount, etc.), pots, players (with holeCards and tableBalanceGwei)
          const potsData = (payload.pots as any[]) || []
          const playersData = (payload.players as any[]) || []
          const handData = payload.hand as any
          const tableData = payload.table as any

          // Extract all winner seat numbers from all pots
          const allWinnerSeats = new Set<number>()
          potsData.forEach((pot: any) => {
            const winnerSeatNumbers = pot.winnerSeatNumbers || pot.eligibleSeatNumbers || []
            winnerSeatNumbers.forEach((seatNum: number) => {
              allWinnerSeats.add(seatNum)
            })
          })
          setWinnerSeats(allWinnerSeats)

          // Clear any existing interval and timeout
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
          }
          if (countdownDisplayTimeoutRef.current) {
            clearTimeout(countdownDisplayTimeoutRef.current)
            countdownDisplayTimeoutRef.current = null
          }

          // Refetch table data to get latest isActive status (in case table was deactivated during the hand)
          // Then decide whether to show countdown or table closed message
          getPokerTables().then((allTables) => {
            const updatedTable = allTables.find(t => t.id === tableId)
            if (updatedTable) {
              setTable(updatedTable)
              
              const isTableInactive = !updatedTable.isActive
              
              if (isTableInactive) {
                // Table was deactivated - show "TABLE CLOSED" instead of countdown
                setShowCountdown(false)
                setHandStartCountdown(null)
                setShowTableClosed(false) // Hide initially
                
                // Delay showing the "TABLE CLOSED" overlay by 3 seconds (same as countdown)
                countdownDisplayTimeoutRef.current = setTimeout(() => {
                  setShowTableClosed(true)
                }, 3000) as any
              } else if (handData?.completedAt) {
                // Table is active - show countdown timer
                const completedAt = new Date(handData.completedAt)
                const delaySeconds = (updatedTable.handStartDelaySeconds && updatedTable.handStartDelaySeconds > 0)
                  ? updatedTable.handStartDelaySeconds
                  : 30 // Default 30 seconds
                const targetTime = completedAt.getTime() + (delaySeconds * 1000)
                
                // Hide countdown initially
                setShowCountdown(false)
                setShowTableClosed(false)
                
                // Update countdown immediately (but don't show yet)
                const updateCountdown = () => {
                  const now = Date.now()
                  const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000))
                  setHandStartCountdown(remaining)
                  
                  if (remaining <= 0) {
                    if (countdownIntervalRef.current) {
                      clearInterval(countdownIntervalRef.current)
                      countdownIntervalRef.current = null
                    }
                    // Trigger exit animation
                    setCountdownExiting(true)
                    // Hide after animation completes (0.5s)
                    setTimeout(() => {
                      setHandStartCountdown(null)
                      setShowCountdown(false)
                      setCountdownExiting(false)
                    }, 500)
                  }
                }
                
                updateCountdown()
                
                // Update every second
                countdownIntervalRef.current = setInterval(updateCountdown, 1000) as any
                
                // Delay showing the countdown overlay by 3 seconds
                countdownDisplayTimeoutRef.current = setTimeout(() => {
                  setShowCountdown(true)
                }, 3000) as any
              }
            }
          }).catch((error) => {
            console.error('[Table] Failed to refetch table data after hand_end:', error)
            // Fall back to showing countdown with existing table data
            if (handData?.completedAt) {
              const completedAt = new Date(handData.completedAt)
              const delaySeconds = (tableData?.handStartDelaySeconds && tableData.handStartDelaySeconds > 0)
                ? tableData.handStartDelaySeconds
                : 30
              const targetTime = completedAt.getTime() + (delaySeconds * 1000)
              
              setShowCountdown(false)
              setShowTableClosed(false)
              
              const updateCountdown = () => {
                const now = Date.now()
                const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000))
                setHandStartCountdown(remaining)
                
                if (remaining <= 0) {
                  if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current)
                    countdownIntervalRef.current = null
                  }
                  setCountdownExiting(true)
                  setTimeout(() => {
                    setHandStartCountdown(null)
                    setShowCountdown(false)
                    setCountdownExiting(false)
                  }, 500)
                }
              }
              
              updateCountdown()
              countdownIntervalRef.current = setInterval(updateCountdown, 1000) as any
              countdownDisplayTimeoutRef.current = setTimeout(() => {
                setShowCountdown(true)
              }, 3000) as any
            }
          })

          // Update table balances using standardized playerBalances field
          // Fall back to players array for backward compatibility
          const balanceData = (payload.playerBalances as any[]) || 
            playersData.map((p: any) => ({
              seatNumber: p.seatNumber,
              tableBalanceGwei: p.tableBalanceGwei,
            }));
          updatePlayerBalances(balanceData);

          setCurrentHand((prev) => {
            if (!prev) return prev

            // Map players from payload to reveal all hole cards and update their statuses
            // Only update players that exist in both prev state and payload (don't add new players from payload)
            const playersWithRevealedCards = prev.players.map((prevPlayer) => {
              const payloadPlayer = playersData.find((p: any) => p.seatNumber === prevPlayer.seatNumber)
              if (payloadPlayer) {
                return {
                  ...prevPlayer,
                  status: payloadPlayer.status || prevPlayer.status,
                  holeCards: payloadPlayer.holeCards ? payloadPlayer.holeCards.map((card: any) => ({
                    suit: card.suit,
                    rank: card.rank,
                  })) : prevPlayer.holeCards,
                  // Store hand rank name for display (only for non-folded players)
                  handRankName: payloadPlayer.handRankName || null,
                }
              }
              return prevPlayer
            })

            // Set status to COMPLETED and clear currentActionSeat immediately to trigger action button exit animation
            // Note: We keep prev.players structure (don't replace with payload players) to avoid stale data issues
            return {
              ...prev,
              status: 'COMPLETED',
              currentActionSeat: null, // Clear action seat so isUserTurn() returns false immediately
              players: playersWithRevealedCards,
              pots: potsData.map((pot: any) => {
                // Find the winner's hand rank name (use first winner if multiple)
                const winnerSeatNumbers = pot.winnerSeatNumbers || pot.eligibleSeatNumbers || []
                const winnerPlayer = playersData.find((p: any) => 
                  winnerSeatNumbers.length > 0 && p.seatNumber === winnerSeatNumbers[0]
                )
                const winnerHandRankName = winnerPlayer?.handRankName || null
                
                return {
                  potNumber: pot.potNumber,
                  amount: pot.amount?.toString() || '0',
                  eligibleSeatNumbers: winnerSeatNumbers,
                  winnerHandRankName, // Store winner's hand rank name for display
                }
              }),
              lastEventId: event.eventId,
            }
          })
          break
        }

        case 'join_table': {
          // Player joined - animate and update state
          const joinPayload = payload as unknown as JoinTableEventPayload
          const seatNumber = joinPayload.seatNumber
          
          // Mark seat as joining (so avatar starts hidden)
          setJoiningSeats((prev) => new Set(prev).add(seatNumber))
          
          // Set animating balance immediately so balance starts at 0 when info box becomes visible
          setAnimatingBalance({
            seatNumber: seatNumber,
            targetAmount: joinPayload.buyInAmountGwei,
            animateFromZero: true, // Animate from 0 for new players joining
          })
          
          // Update players list FIRST so avatar is rendered (but hidden initially)
          setPlayers((prevPlayers) => {
            // Check if player already exists (avoid duplicates)
            const existingIndex = prevPlayers.findIndex(
              p => p.seatNumber === seatNumber
            )
            
            const newPlayer: TablePlayer = {
              id: Date.now(), // Temporary ID, will be replaced by API data
              walletAddress: joinPayload.player,
              twitterHandle: joinPayload.twitterHandle,
              twitterAvatarUrl: joinPayload.twitterAvatarUrl,
              seatNumber: seatNumber,
              joinedAt: new Date().toISOString(),
              tableBalanceGwei: joinPayload.buyInAmountGwei,
            }
            
            if (existingIndex >= 0) {
              // Replace existing player
              const updated = [...prevPlayers]
              updated[existingIndex] = newPlayer
              return updated
            } else {
              // Add new player
              return [...prevPlayers, newPlayer].sort((a, b) => a.seatNumber - b.seatNumber)
            }
          })
          
          // CSS animations will handle all visual effects (flourish, avatar, info box, spotlight)
          
          // Remove from joining seats after animation completes (1.8s total: 0.6s flourish/avatar + 0.8s delay + 0.4s info box)
          setTimeout(() => {
            setJoiningSeats((prev) => {
              const next = new Set(prev)
              next.delete(seatNumber)
              return next
            })
            
            // Clear animating balance after count-up completes
            setTimeout(() => {
              setAnimatingBalance(null)
            }, 500)
          }, 1800)
          break
        }

        case 'leave_table': {
          // Player left - animate out, then remove from players list
          const leavePayload = payload as unknown as LeaveTableEventPayload
          const seatNumber = leavePayload.seatNumber
          
          // Mark seat as leaving (triggers CSS animations)
          setLeavingSeats((prev) => new Set(prev).add(seatNumber))
          
          // Remove from players list after animation completes (0.6s)
          setTimeout(() => {
            setPlayers((prevPlayers) => prevPlayers.filter(p => p.seatNumber !== seatNumber))
            
            // Remove from leaving seats
            setLeavingSeats((prev) => {
              const next = new Set(prev)
              next.delete(seatNumber)
              return next
            })
          }, 600)
          break
        }

        case 'chat_message': {
          // Handle chat message from SSE
          const chatPayload = payload as unknown as ChatMessage
          
          // Add message to chat
          setChatMessages((prev) => [...prev, chatPayload])
          
          // Increment unread count if chat is closed
          if (!isChatOpenRef.current) {
            setUnreadChatCount((prev) => prev + 1)
          }
          break
        }

        default:
          console.log(`[Table] Unhandled event kind: ${kind}`, payload)
      }
    } catch (error) {
      console.error(`[Table] Error handling event ${kind}:`, error, payload)
    }
  }, [isLoggedIn, isFullyLoggedIn, address, signature, tableId])

  /**
   * SSE connection for real-time table events
   * Connects when tableId is available (regardless of player count)
   * This ensures we receive join_table/leave_table events even when there are 0-1 players
   */
  useTableEvents({
    tableId: tableId || null,
    enabled: !!tableId,
    lastEventId: currentHand?.lastEventId,
    onEvent: handleEvent,
  })

  /**
   * Handles sending a chat message
   */
  async function handleSendChatMessage(message: string) {
    if (!tableId || !signature || !address) {
      throw new Error('Not authenticated')
    }

    const twitterToken = localStorage.getItem('twitterAccessToken')
    if (!twitterToken) {
      throw new Error('Twitter authentication required')
    }

    await sendChatMessage(tableId, message, signature, twitterToken, address)
  }

  /**
   * Handles Buy In button click
   */
  function handleBuyInClick(seatNumber: number) {
    if (!isFullyLoggedIn) {
      setIsLoginDialogOpen(true)
      return
    }
    // Prevent joining deactivated tables
    if (table && !table.isActive) {
      return
    }
    setSelectedSeatNumber(seatNumber)
    setIsBuyInDialogOpen(true)
  }

  /**
   * Handles buy-in confirmation
   */
  async function handleBuyInConfirm(buyInAmountGwei: string) {
    if (!tableId || selectedSeatNumber === null || !address || !signature || !twitterUser) {
      return
    }

    const twitterAccessToken = localStorage.getItem('twitterAccessToken')
    if (!twitterAccessToken) {
      alert('Twitter authentication required. Please log in again.')
      setIsLoginDialogOpen(true)
      return
    }

    setIsJoining(true)

    try {
      await joinTable(
        {
          tableId,
          seatNumber: selectedSeatNumber,
          buyInAmountGwei,
        },
        address,
        signature,
        twitterAccessToken
      )

      // Close dialog
      setIsBuyInDialogOpen(false)
      setSelectedSeatNumber(null)
      
      // Don't refresh players here - wait for join_table SSE event
      // The SSE event will update the players list
    } catch (error) {
      console.error('Failed to join table:', error)
      alert(error instanceof Error ? error.message : 'Failed to join table. Please try again.')
    } finally {
      setIsJoining(false)
    }
  }

  /**
   * Checks if user can afford minimum buy-in for a seat
   */
  function canAffordSeat(): boolean {
    if (!table || !escrowBalanceState) {
      return false
    }
    const balanceGwei = BigInt(escrowBalanceGwei)
    const minBuyInGwei = BigInt(table.minimumBuyIn)
    return balanceGwei >= minBuyInGwei
  }

  /**
   * Checks if the current user is seated at this table
   */
  function isUserSeated(): boolean {
    if (!address || !players.length) {
      return false
    }
    const normalizedAddress = address.toLowerCase()
    return players.some(p => p.walletAddress.toLowerCase() === normalizedAddress)
  }

  /**
   * Gets the current user's player info if they're seated
   */
  function getUserPlayer(): TablePlayer | null {
    if (!address || !players.length) {
      return null
    }
    const normalizedAddress = address.toLowerCase()
    return players.find(p => p.walletAddress.toLowerCase() === normalizedAddress) || null
  }

  /**
   * Gets the hand player for the current user
   */
  function getUserHandPlayer() {
    if (!currentHand || !address) return null
    const normalizedAddress = address.toLowerCase()
    return currentHand.players.find(p => p.walletAddress.toLowerCase() === normalizedAddress) || null
  }

  /**
   * Checks if it's the current user's turn to act
   */
  function isUserTurn(): boolean {
    const userHandPlayer = getUserHandPlayer()
    if (!currentHand || !userHandPlayer) return false
    return currentHand.currentActionSeat === userHandPlayer.seatNumber && userHandPlayer.status === 'ACTIVE'
  }


  /**
   * Checks if it's a specific seat's turn to act
   */
  function isSeatTurn(seatNumber: number): boolean {
    if (!currentHand) return false
    const handPlayer = getHandPlayerBySeat(seatNumber)
    return currentHand.currentActionSeat === seatNumber && handPlayer?.status === 'ACTIVE'
  }

  /**
   * Gets hand player by seat number
   */
  function getHandPlayerBySeat(seatNumber: number) {
    if (!currentHand) return null
    return currentHand.players.find(p => p.seatNumber === seatNumber) || null
  }

  /**
   * Handles Stand Up button click - opens confirmation dialog
   */
  function handleStandUpClick() {
    setIsStandUpConfirmOpen(true)
  }

  /**
   * Handles Fold button click
   */
  async function handleFoldClick() {
    if (!tableId || !address || !signature || isProcessingAction) {
      return
    }

    setIsProcessingAction(true)
    setActionError(null)

    try {
      const result = await playerAction(tableId, 'FOLD', address, signature)
      
      if (result.handEnded) {
        // Hand ended, polling will pick up the new state
        console.log('Hand ended after fold')
      }
      
      // Clear any previous errors on success
      setActionError(null)
      
      // Polling will automatically pick up the state change
    } catch (err: any) {
      console.error('Failed to fold:', err)
      setActionError(err.message || 'Failed to fold')
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Handles Check/Call button click
   */
  async function handleCheckCallClick() {
    if (!tableId || !address || !signature || isProcessingAction || !currentHand) {
      return
    }

    setIsProcessingAction(true)
    setActionError(null)

    try {
      const userHandPlayer = getUserHandPlayer()
      if (!userHandPlayer) {
        throw new Error('Player not found in hand')
      }

      const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
      const chipsCommitted = userHandPlayer.chipsCommitted ? BigInt(userHandPlayer.chipsCommitted) : 0n
      const canCheck = currentBet === 0n || chipsCommitted >= currentBet

      const action = canCheck ? 'CHECK' : 'CALL'
      const result = await playerAction(tableId, action, address, signature)
      
      if (result.handEnded) {
        console.log('Hand ended after check/call')
      }
      
      if (result.roundAdvanced) {
        console.log('Betting round advanced')
      }
      
      // Clear any previous errors on success
      setActionError(null)
      
      // Polling will automatically pick up the state change
    } catch (err: any) {
      console.error('Failed to check/call:', err)
      setActionError(err.message || 'Failed to check/call')
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Gets the call amount needed (if any)
   */
  function getCallAmount(): bigint | null {
    if (!currentHand) return null
    
    const userHandPlayer = getUserHandPlayer()
    if (!userHandPlayer) return null

    const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
    const chipsCommitted = userHandPlayer.chipsCommitted ? BigInt(userHandPlayer.chipsCommitted) : 0n
    
    if (currentBet === 0n || chipsCommitted >= currentBet) {
      return null // Can check
    }
    
    return currentBet - chipsCommitted
  }

  /**
   * Handles Bet/Raise button click - opens dialog
   */
  function handleBetRaiseClick() {
    setIsBetRaiseDialogOpen(true)
  }

  /**
   * Handles Bet/Raise confirmation from dialog
   */
  async function handleBetRaiseConfirm(amountGwei: string) {
    if (!tableId || !address || !signature || isProcessingAction || !currentHand) {
      return
    }

    setIsProcessingAction(true)
    setActionError(null)
    setIsBetRaiseDialogOpen(false)

    try {
      const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
      const isBetting = currentBet === 0n
      const action = isBetting ? 'BET' : 'RAISE'
      
      const result = await playerAction(tableId, action, address, signature, amountGwei)
      
      if (result.handEnded) {
        console.log(`Hand ended after ${action.toLowerCase()}`)
      }
      
      if (result.roundAdvanced) {
        console.log('Betting round advanced')
      }
      
      setActionError(null)
    } catch (err: any) {
      const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
      const isBetting = currentBet === 0n
      const action = isBetting ? 'bet' : 'raise'
      console.error(`Failed to ${action}:`, err)
      setActionError(err.message || `Failed to ${action}`)
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Handles All-in button click
   */
  /**
   * Handles All-in button click
   * All-in is now handled as a RAISE with the player's incremental amount (full stack).
   * The incremental amount is simply the player's remaining tableBalanceGwei.
   */
  async function handleAllInClick() {
    if (!tableId || !address || !signature || isProcessingAction) {
      return
    }

    const userHandPlayer = getUserHandPlayer()
    if (!userHandPlayer) {
      setActionError('Player not in hand')
      return
    }

    // Get table balance from players array
    const userPlayer = players.find(p => 
      p.walletAddress.toLowerCase() === address.toLowerCase()
    )
    if (!userPlayer) {
      setActionError('Player not found')
      return
    }

    // For all-in, the incremental amount is the player's entire remaining balance
    const tableBalanceGwei = BigInt(userPlayer.tableBalanceGwei || '0')

    setIsProcessingAction(true)
    setActionError(null)

    try {
      // Call RAISE action with the incremental amount (full stack)
      // The backend will detect this equals the full stack and handle it as all-in
      const result = await playerAction(
        tableId, 
        'RAISE', 
        address, 
        signature,
        tableBalanceGwei.toString()
      )
      
      if (result.handEnded) {
        console.log('Hand ended after all-in')
      }
      
      if (result.roundAdvanced) {
        console.log('Betting round advanced')
      }
      
      setActionError(null)
    } catch (err: any) {
      console.error('Failed to go all-in:', err)
      setActionError(err.message || 'Failed to go all-in')
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Gets minimum raise amount
   */
  function getMinimumRaise(): bigint {
    if (!currentHand || !table) return 0n
    
    const lastRaiseAmount = currentHand.lastRaiseAmount ? BigInt(currentHand.lastRaiseAmount) : null
    
    if (lastRaiseAmount !== null && lastRaiseAmount > 0n) {
      return lastRaiseAmount
    }
    
    return BigInt(table.bigBlind)
  }

  /**
   * Handles stand up confirmation
   */
  async function handleStandUpConfirm() {
    if (!tableId || !address || !signature) {
      return
    }

    setIsStandingUp(true)

    try {
      await standUp(
        { tableId },
        address,
        signature
      )

      // Close dialog
      setIsStandUpConfirmOpen(false)
      
      // Don't refresh players here - wait for leave_table SSE event
      // The SSE event will trigger animations which will update the players list

      // Note: Escrow balance will be refreshed automatically by the useEscrowBalance hook
      // when the user navigates to a page that displays it (like Profile)
    } catch (error) {
      console.error('Failed to stand up:', error)
      alert(error instanceof Error ? error.message : 'Failed to stand up. Please try again.')
    } finally {
      setIsStandingUp(false)
    }
  }

  return (
    <div className={`app ${isChatOpen ? 'chat-open' : ''}`}>
      {/* Header */}
      <Header
        onLoginClick={() => setIsLoginDialogOpen(true)}
      />

      {/* Main Content Wrapper - flex container for table and chat */}
      <div className="table-layout-wrapper">
        {/* Main Content */}
        <main className="table-main">
        {/* Background Table Image */}
        <div className="table-image-container">
          <img 
            src="/table.jpeg" 
            alt="Poker Table" 
            className="table-image"
          />
          
          {/* Pots Display - Above Community Cards */}
          {currentHand && currentHand.pots.length > 0 && (
            <div className="table-pots">
              {currentHand.pots.map((pot) => (
                <div key={pot.potNumber} className="table-pot">
                  <div className="table-pot-top-row">
                    <div className="table-pot-avatars">
                      {pot.eligibleSeatNumbers.map((seatNum) => {
                        const handPlayer = getHandPlayerBySeat(seatNum)
                        if (!handPlayer?.twitterAvatarUrl) return null
                        return (
                          <img
                            key={seatNum}
                            src={handPlayer.twitterAvatarUrl}
                            alt={handPlayer.twitterHandle || 'Player'}
                            className="table-pot-avatar"
                          />
                        )
                      })}
                    </div>
                    <div className={`table-pot-amount ${updatingPotNumbers.has(pot.potNumber) ? 'updating' : ''}`}>
                      {formatEth(pot.amount)}
                    </div>
                  </div>
                  {currentHand.status === 'COMPLETED' && pot.winnerHandRankName && (
                    <div className="table-pot-hand-rank">
                      {pot.winnerHandRankName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Community Cards - Center of Table */}
          {currentHand && currentHand.communityCards.length > 0 && (
            <div className="table-community-cards">
              {currentHand.communityCards.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  rank={card.rank}
                />
              ))}
            </div>
          )}
          
          {/* Action Animation Overlay - Centered over Community Cards */}
          {actionAnimation && (
            <div className="table-action-overlay">
              <div className="table-action-overlay-content">
                <div className="table-action-overlay-action">
                  {actionAnimation.actionType === 'ALL_IN' ? 'ALL IN!' : 
                   actionAnimation.actionType === 'CHECK' ? 'CHECK!' : 
                   actionAnimation.actionType === 'FOLD' ? 'FOLD!' : 
                   actionAnimation.actionType}
                </div>
                {actionAnimation.amount && (
                  <div className="table-action-overlay-amount">
                    {actionAnimation.amount}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New Hand Message Overlay - Centered over Community Cards */}
          {showNewHandMessage && (
            <div className="table-action-overlay">
              <div className="table-action-overlay-content">
                <div className="table-action-overlay-action">
                  NEW HAND!
                </div>
              </div>
            </div>
          )}

          {/* Hand Start Countdown Overlay - Centered over Community Cards */}
          {showCountdown && handStartCountdown !== null && (
            <div className={`table-action-overlay countdown-overlay ${countdownExiting ? 'countdown-exiting' : ''}`}>
              <div className="table-action-overlay-content">
                <div className="table-action-overlay-action">
                  NEW HAND IN
                </div>
                <div className="table-action-overlay-amount">
                  {handStartCountdown > 0 ? `${handStartCountdown}s` : '0s'}
                </div>
              </div>
            </div>
          )}

          {/* Table Closed Overlay - Shown when table is deactivated after hand ends */}
          {showTableClosed && (
            <div className="table-action-overlay countdown-overlay table-closed-overlay">
              <div className="table-action-overlay-content">
                <div className="table-action-overlay-action table-closed-text">
                  TABLE CLOSED
                </div>
              </div>
            </div>
          )}
          
          {/* Seat Avatars */}
          {table && table.maxSeatCount > 0 && (
            <div className="table-seats-container">
              {calculateSeatPositions(table.maxSeatCount).map((position, seatIndex) => {
                // Find player at this seat
                const player = players.find(p => p.seatNumber === seatIndex)
                const hasPlayer = !!player
                
                // Convert table balance from gwei to ETH
                const tableBalanceEth = player?.tableBalanceGwei
                  ? formatEth(player.tableBalanceGwei)
                  : null
                
                return (
                  <div
                    key={seatIndex}
                    ref={(el) => {
                      if (el) {
                        seatRefs.current.set(seatIndex, el)
                      } else {
                        seatRefs.current.delete(seatIndex)
                      }
                    }}
                      className={`table-seat-avatar ${joiningSeats.has(seatIndex) ? 'joining' : ''} ${leavingSeats.has(seatIndex) ? 'leaving' : ''} ${isFullyLoggedIn && isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && (!currentHand || currentHand.status === 'COMPLETED') ? 'table-seat-avatar-with-standup' : ''}`}
                    style={{
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {hasPlayer && player.twitterHandle ? (
                      <>
                        {/* Player Avatar */}
                        <div className={`table-seat-avatar-circle table-seat-avatar-filled ${winnerSeats.has(seatIndex) ? 'table-seat-winner-bounce' : ''}`}>
                          {player.twitterAvatarUrl ? (
                            <img
                              src={player.twitterAvatarUrl}
                              alt={player.twitterHandle || 'Player'}
                              className="table-seat-avatar-image"
                              onError={(e) => {
                                // Fallback to initial if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && player.twitterHandle) {
                                  const initialDiv = document.createElement('div');
                                  initialDiv.className = 'table-seat-avatar-initial';
                                  initialDiv.textContent = player.twitterHandle.charAt(1).toUpperCase();
                                  parent.appendChild(initialDiv);
                                }
                              }}
                            />
                          ) : (
                            <div 
                              className="table-seat-avatar-initial"
                            >
                              {player.twitterHandle ? player.twitterHandle.charAt(1).toUpperCase() : '?'}
                            </div>
                          )}
                        </div>
                        
                        {/* Action Timeout Countdown */}
                        {currentHand && currentHand.currentActionSeat === seatIndex && currentHand.actionTimeoutAt && (
                          <ActionTimeoutCountdown timeoutAt={currentHand.actionTimeoutAt} />
                        )}
                        
                        {/* Badges for dealer/blinds - can show multiple - positioned outside circle to avoid clipping */}
                        {currentHand && (
                          <div className="table-seat-badges">
                            {currentHand.dealerPosition === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-dealer">D</div>
                            )}
                            {currentHand.smallBlindSeat === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-small-blind">SB</div>
                            )}
                            {currentHand.bigBlindSeat === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-big-blind">BB</div>
                            )}
                          </div>
                        )}

                        {/* Player Cards */}
                        {currentHand && (() => {
                          const handPlayer = getHandPlayerBySeat(seatIndex)
                          const isAuthorizedPlayer = address && player.walletAddress.toLowerCase() === address.toLowerCase()
                          const isHandEnded = currentHand.status === 'COMPLETED'
                          
                          if (!handPlayer) return null
                          
                          // After hand ends, show hole cards for all non-folded players
                          if (isHandEnded && handPlayer.holeCards && handPlayer.status !== 'FOLDED') {
                            return (
                              <div className="table-seat-cards">
                                {handPlayer.holeCards.map((card, idx) => (
                                  <Card
                                    key={idx}
                                    suit={card.suit}
                                    rank={card.rank}
                                  />
                                ))}
                              </div>
                            )
                          }
                          
                          // During active hand: Show hole cards for authorized player if active or all-in
                          if (!isHandEnded && isAuthorizedPlayer && handPlayer.holeCards && (handPlayer.status === 'ACTIVE' || handPlayer.status === 'ALL_IN')) {
                            return (
                              <div className="table-seat-cards">
                                {handPlayer.holeCards.map((card, idx) => (
                                  <Card
                                    key={idx}
                                    suit={card.suit}
                                    rank={card.rank}
                                  />
                                ))}
                              </div>
                            )
                          }
                          
                          // During active hand: Show card backs for other players in hand (active or all-in)
                          if (!isHandEnded && !isAuthorizedPlayer && (handPlayer.status === 'ACTIVE' || handPlayer.status === 'ALL_IN')) {
                            return (
                              <div className="table-seat-cards">
                                <Card isBack={true} />
                                <Card isBack={true} />
                              </div>
                            )
                          }
                          
                          return null
                        })()}
                        
                        {/* Player Info Box */}
                        <div className={`table-seat-player-info ${position.x > 50 ? 'table-seat-player-info-right' : ''} ${isSeatTurn(seatIndex) ? 'table-seat-player-info-turn' : ''} ${winnerSeats.has(seatIndex) ? 'table-seat-winner-bounce' : ''}`}>
                          <div className="table-seat-player-info-content">
                            <a
                              href={`https://twitter.com/${player.twitterHandle.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="table-seat-twitter-handle"
                            >
                              {player.twitterHandle}
                            </a>
                            {tableBalanceEth && (
                              <BalanceDisplay
                                balance={tableBalanceEth}
                                isAnimating={animatingBalance?.seatNumber === seatIndex}
                                targetAmount={animatingBalance?.seatNumber === seatIndex ? animatingBalance.targetAmount : undefined}
                                animateFromZero={animatingBalance?.seatNumber === seatIndex ? (animatingBalance.animateFromZero ?? false) : false}
                              />
                            )}
                          </div>
                          {/* Stand Up Button - outside content, aligned to player-info edges */}
                          {isFullyLoggedIn && isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && (!currentHand || currentHand.status === 'COMPLETED') && (
                              <button
                                className="table-seat-stand-up-button"
                                onClick={handleStandUpClick}
                                disabled={isStandingUp}
                                title="Stand up from the table"
                              >
                                Stand Up
                              </button>
                            )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="table-seat-avatar-circle" />
                        <AnimatePresence initial={false}>
                          {isFullyLoggedIn && !isUserSeated() && table.isActive && (
                            <motion.button
                              key={`buy-in-${seatIndex}`}
                              className="table-seat-buy-in-button"
                              onClick={() => handleBuyInClick(seatIndex)}
                              disabled={!canAffordSeat()}
                              title={
                                !canAffordSeat()
                                  ? `Insufficient balance. Minimum buy-in: ${formatEth(table.minimumBuyIn)}`
                                  : `Buy in to seat ${seatIndex}`
                              }
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                            >
                              Buy In
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Table Name - on top of background */}
        <h1 className="table-name">{table ? table.name : `Table ${tableId || '...'}`}</h1>

        {/* Action Buttons - Show when it's user's turn */}
        {/* Positioned above community cards to avoid covering player cards */}
        <AnimatePresence>
          {currentHand && isUserTurn() && (
            <motion.div
              className="table-action-buttons"
              initial={{ opacity: 0, y: 20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 20, x: '-50%' }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
            <div className="table-action-info">
              {actionError && (
                <div className="table-action-error" style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '8px' }}>
                  {actionError}
                </div>
              )}
              {currentHand.currentBet && (
                <div className="table-action-current-bet">
                  Current Bet: {formatEth(currentHand.currentBet)}
                </div>
              )}
            </div>
            <div className="table-action-buttons-row">
              <button
                className="table-action-button table-action-button-fold"
                onClick={handleFoldClick}
                disabled={isProcessingAction}
              >
                {isProcessingAction ? 'Processing...' : 'Fold'}
              </button>
              {(() => {
                // Check if user can afford to call
                const callAmount = getCallAmount()
                const userPlayer = players.find(p => 
                  p.walletAddress.toLowerCase() === address?.toLowerCase()
                )
                const tableBalanceGwei = userPlayer?.tableBalanceGwei ? BigInt(userPlayer.tableBalanceGwei) : 0n
                const canAffordCall = callAmount === null || callAmount <= tableBalanceGwei
                
                return (
                  <>
                    {canAffordCall && (
                      <button
                        className="table-action-button table-action-button-check-call"
                        onClick={handleCheckCallClick}
                        disabled={isProcessingAction}
                      >
                        {(() => {
                          if (callAmount === null) {
                            return isProcessingAction ? 'Processing...' : 'Check'
                          } else {
                            const callAmountEth = formatEth(callAmount)
                            return isProcessingAction ? 'Processing...' : `Call ${callAmountEth}`
                          }
                        })()}
                      </button>
                    )}
                    {canAffordCall && (
                      <button
                        className="table-action-button table-action-button-raise"
                        onClick={handleBetRaiseClick}
                        disabled={isProcessingAction}
                      >
                        {currentHand.currentBet && Number(currentHand.currentBet) > 0 ? 'Raise' : 'Bet'}
                      </button>
                    )}
                  </>
                )
              })()}
              <button
                className="table-action-button table-action-button-all-in"
                onClick={handleAllInClick}
                disabled={isProcessingAction}
              >
                All-in
              </button>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Chat Panel - inside layout wrapper */}
      <Chat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        isFullyLoggedIn={isFullyLoggedIn}
        isTableActive={table?.isActive ?? true}
      />

      {/* Hand History Panel - inside layout wrapper */}
      {tableId && (
        <HandHistory
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          tableId={tableId}
        />
      )}
      </div>{/* End table-layout-wrapper */}

      {/* Login Dialog */}
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
        onLoginSuccess={() => setIsLoginDialogOpen(false)}
      />

      {/* Buy In Dialog */}
      {table && selectedSeatNumber !== null && (
        <BuyInDialog
          isOpen={isBuyInDialogOpen}
          onClose={() => {
            setIsBuyInDialogOpen(false)
            setSelectedSeatNumber(null)
          }}
          onConfirm={handleBuyInConfirm}
          minimumBuyInGwei={table.minimumBuyIn}
          maximumBuyInGwei={table.maximumBuyIn}
          escrowBalanceGwei={escrowBalanceGwei}
          isLoading={isJoining}
        />
      )}

      {/* Stand Up Confirmation Dialog */}
      {table && (
        <ConfirmDialog
          isOpen={isStandUpConfirmOpen}
          onClose={() => setIsStandUpConfirmOpen(false)}
          onConfirm={handleStandUpConfirm}
          title="Stand Up"
          message={`Are you sure you want to stand up from ${table.name}? Your table balance will be moved back to your escrow.`}
          confirmText="Stand Up"
          cancelText="Cancel"
          isLoading={isStandingUp}
        />
      )}

      {/* Bet/Raise Dialog */}
      {table && currentHand && address && (() => {
        const userHandPlayer = getUserHandPlayer()
        if (!userHandPlayer) return null

        // Get table balance from players array (TablePlayer)
        const userPlayer = players.find(p => 
          p.walletAddress.toLowerCase() === address.toLowerCase()
        )
        if (!userPlayer) return null

        const currentBet = currentHand.currentBet || null
        const chipsCommitted = userHandPlayer.chipsCommitted || '0'
        const tableBalanceGwei = userPlayer.tableBalanceGwei || '0'
        const isBetting = !currentBet || Number(currentBet) === 0

        return (
          <BetRaiseDialog
            isOpen={isBetRaiseDialogOpen}
            onClose={() => setIsBetRaiseDialogOpen(false)}
            onConfirm={handleBetRaiseConfirm}
            currentBet={currentBet}
            chipsCommitted={chipsCommitted}
            tableBalanceGwei={tableBalanceGwei}
            bigBlind={table.bigBlind}
            minimumRaise={getMinimumRaise().toString()}
            isBetting={isBetting}
            isLoading={isProcessingAction}
          />
        )
      })()}

      {/* History Icon Button - Hidden when history or chat panel is open */}
      {!isHistoryOpen && !isChatOpen && (
        <button
          className="history-icon-button"
          onClick={() => setIsHistoryOpen(true)}
          aria-label="Open hand history"
        >
          <FaHistory />
        </button>
      )}

      {/* Chat Icon Button - Only visible for logged in users when chat and history are closed */}
      {isFullyLoggedIn && !isChatOpen && !isHistoryOpen && (
        <button
          className="chat-icon-button"
          onClick={() => setIsChatOpen(true)}
          aria-label="Open chat"
        >
          <FaComments />
          {unreadChatCount > 0 && (
            <span className="chat-notification-badge">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </button>
      )}

    </div>
  )
}

export default Table

