import { useState, createContext, useContext } from 'react'
import { Header } from './Header'
import { LoginDialog } from './LoginDialog'

/**
 * Context for triggering the login dialog from child components
 */
interface LoginDialogContextType {
  /**
   * Opens the login dialog
   */
  openLoginDialog: () => void
}

const LoginDialogContext = createContext<LoginDialogContextType | null>(null)

/**
 * Hook to access the login dialog trigger from child components
 *
 * Must be used within a PageLayout component.
 *
 * @returns Object with openLoginDialog function
 * @throws Error if used outside of PageLayout
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { openLoginDialog } = useLoginDialog();
 *   return <button onClick={openLoginDialog}>Sign In</button>;
 * }
 * ```
 */
export function useLoginDialog(): LoginDialogContextType {
  const context = useContext(LoginDialogContext)
  if (!context) {
    throw new Error('useLoginDialog must be used within a PageLayout')
  }
  return context
}

/**
 * Props for the PageLayout component
 */
interface PageLayoutProps {
  /**
   * Page content to render inside the layout
   */
  children: React.ReactNode

  /**
   * Optional custom navigation links for the Header
   * If not provided, Header uses its default navigation
   */
  navLinks?: Array<{
    to?: string
    href?: string
    label: string
  }>

  /**
   * Optional custom action button for the Header (e.g., "Play Now")
   * If not provided, Header shows login button or user profile dropdown
   */
  actionButton?: React.ReactNode

  /**
   * Optional CSS class name for the container div
   * @default "app"
   */
  containerClassName?: string
}

/**
 * PageLayout component
 *
 * A shared layout wrapper that provides consistent Header and LoginDialog
 * behavior across pages. Centralizes the login dialog state management
 * to eliminate duplication across page components.
 *
 * Usage:
 * ```tsx
 * function MyPage() {
 *   return (
 *     <PageLayout>
 *       <div className="my-page-content">...</div>
 *     </PageLayout>
 *   )
 * }
 * ```
 *
 * With custom navigation:
 * ```tsx
 * <PageLayout
 *   navLinks={[{ to: '/', label: 'Home' }, { href: '/docs/', label: 'Docs' }]}
 *   actionButton={<Link to="/play">Play Now</Link>}
 * >
 *   {children}
 * </PageLayout>
 * ```
 *
 * @param props - PageLayout component props
 * @returns PageLayout JSX element with Header, children, and LoginDialog
 */
export function PageLayout({
  children,
  navLinks,
  actionButton,
  containerClassName = 'app',
}: PageLayoutProps) {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)

  /**
   * Opens the login dialog - can be called from child components via useLoginDialog
   */
  function openLoginDialog() {
    setIsLoginDialogOpen(true)
  }

  /**
   * Handles successful login by closing the dialog
   */
  function handleLoginSuccess() {
    setIsLoginDialogOpen(false)
  }

  return (
    <LoginDialogContext.Provider value={{ openLoginDialog }}>
      <div className={containerClassName}>
        <Header
          navLinks={navLinks}
          actionButton={actionButton}
          onLoginClick={openLoginDialog}
        />

        {children}

        <LoginDialog
          isOpen={isLoginDialogOpen}
          onClose={() => setIsLoginDialogOpen(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    </LoginDialogContext.Provider>
  )
}

