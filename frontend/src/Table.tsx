import './App.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getPokerTables, getTablePlayers, joinTable, standUp, getCurrentHand, watchCurrentHand, playerAction, type PokerTable, type TablePlayer, type CurrentHand } from './services/tables'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { BuyInDialog } from './components/BuyInDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { BetRaiseDialog } from './components/BetRaiseDialog'
import { formatEth } from './utils/formatEth'
import { Card } from './components/Card'
import { useWallet } from './contexts/WalletContext'
import { useTwitterUser } from './hooks/useTwitterUser'
import { useEscrowBalance } from './hooks/useEscrowBalance'
import { useTableEvents } from './hooks/useTableEvents'
import type { TableEvent } from './utils/eventQueue'
import type { JoinTableEventPayload, LeaveTableEventPayload } from './utils/animations'
import { AnimatePresence, motion } from 'framer-motion'

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
  const [updatingPotNumbers, setUpdatingPotNumbers] = useState<Set<number>>(new Set())
  const previousPotAmountsRef = useRef<Map<number, string>>(new Map())
  const seatRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [winnerSeats, setWinnerSeats] = useState<Set<number>>(new Set())

  const { address, signature, isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const escrowBalanceState = useEscrowBalance()

  const tableId = id ? parseInt(id, 10) : null
  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address && !!signature
  const escrowBalanceGwei = escrowBalanceState?.balanceGwei || '0'

  /**
   * Calculates seat positions around an oval table
   * 
   * @param seatCount - Number of seats around the table
   * @returns Array of {x, y} positions as percentages (0-100)
   */
  function calculateSeatPositions(seatCount: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = []
    
    // Oval table dimensions (as percentages of container)
    // Using an ellipse with horizontal radius ~45% and vertical radius ~35%
    const radiusX = 45 // horizontal radius
    const radiusY = 35 // vertical radius
    const centerX = 50
    const centerY = 50
    
    // For corner positions (diagonal), extend radius further out
    const cornerRadiusMultiplier = 1.15 // 15% further out for corners
    
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
   * Loads table information from the API
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
          
          // Update table balance for the acting player if provided
          // Use functional setState to avoid stale closure issue
          if (actionData?.tableBalanceGwei && actionData?.seatNumber !== undefined) {
            setPlayers((prevPlayers) => {
              const actingPlayer = prevPlayers.find(p => p.seatNumber === actionData.seatNumber)
              
              if (actingPlayer) {
                const newBalance = actionData.tableBalanceGwei
                const oldBalance = actingPlayer.tableBalanceGwei
                
                if (newBalance !== oldBalance) {
                  // Trigger balance animation for this player (animate from current balance, not 0)
                  setAnimatingBalance({
                    seatNumber: actionData.seatNumber,
                    targetAmount: newBalance,
                    animateFromZero: false, // Animate from existing balance
                  })
                  
                  // Update the player's balance in state
                  return prevPlayers.map((p) =>
                    p.seatNumber === actionData.seatNumber
                      ? { ...p, tableBalanceGwei: newBalance }
                      : p
                  )
                }
              }
              
              // No change needed, return same array reference
              return prevPlayers
            })
          }

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

          // Extract all winner seat numbers from all pots
          const allWinnerSeats = new Set<number>()
          potsData.forEach((pot: any) => {
            const winnerSeatNumbers = pot.winnerSeatNumbers || pot.eligibleSeatNumbers || []
            winnerSeatNumbers.forEach((seatNum: number) => {
              allWinnerSeats.add(seatNum)
            })
          })
          setWinnerSeats(allWinnerSeats)

          // Update table balances for all players and trigger animations
          // Use functional setState to avoid stale closure issue
          setPlayers((prevPlayers) => {
            const updatedPlayers = prevPlayers.map((p) => {
              const payloadPlayer = playersData.find((pp: any) => pp.seatNumber === p.seatNumber)
              if (payloadPlayer?.tableBalanceGwei) {
                const newBalance = payloadPlayer.tableBalanceGwei
                const oldBalance = p.tableBalanceGwei
                
                // Trigger animation if balance changed
                if (newBalance !== oldBalance) {
                  setAnimatingBalance({
                    seatNumber: p.seatNumber,
                    targetAmount: newBalance,
                    animateFromZero: false, // Animate from existing balance
                  })
                }
                
                return { ...p, tableBalanceGwei: newBalance }
              }
              return p
            })
            
            return updatedPlayers
          })

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

          // Wait 10 seconds before completing event processing
          // This ensures hand_start events that arrive immediately will wait until cards are revealed
          await new Promise(resolve => setTimeout(resolve, 10000))
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
   * Handles Buy In button click
   */
  function handleBuyInClick(seatNumber: number) {
    if (!isFullyLoggedIn) {
      setIsLoginDialogOpen(true)
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
    <div className="app">
      {/* Header */}
      <Header
        onLoginClick={() => setIsLoginDialogOpen(true)}
      />

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
                    className={`table-seat-avatar ${joiningSeats.has(seatIndex) ? 'joining' : ''} ${leavingSeats.has(seatIndex) ? 'leaving' : ''}`}
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
                          <div 
                            className="table-seat-player-info-content"
                            style={{
                              marginTop: (isFullyLoggedIn && isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && !currentHand) ? '60px' : '0'
                            }}
                          >
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
                            {/* Stand Up Button - only show if this is the current user's seat and no hand active */}
                            {isFullyLoggedIn && isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && !currentHand && (
                              <button
                                className="table-seat-stand-up-button"
                                onClick={handleStandUpClick}
                                disabled={isStandingUp}
                                title="Stand up from the table"
                                style={{ marginTop: '20px' }}
                              >
                                Stand Up
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="table-seat-avatar-circle" />
                        <AnimatePresence initial={false}>
                          {isFullyLoggedIn && !isUserSeated() && (
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
    </div>
  )
}

export default Table

