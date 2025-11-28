/**
 * Reusable component for handling loading, error, and empty states
 *
 * Provides consistent UI for async data loading states across the application.
 */

import './AsyncState.css';

/**
 * Props for AsyncState component
 */
export interface AsyncStateProps {
  /**
   * Whether data is currently loading
   */
  isLoading: boolean;
  /**
   * Error message if loading failed (null if no error)
   */
  error: string | null;
  /**
   * Whether the data is empty (no items found)
   */
  isEmpty: boolean;
  /**
   * Message to display when data is empty
   */
  emptyMessage?: string;
  /**
   * Message to display while loading
   */
  loadingMessage?: string;
  /**
   * Message to display when there's an error
   */
  errorMessage?: string;
  /**
   * Content to render when data is loaded and not empty
   */
  children: React.ReactNode;
  /**
   * Additional CSS class name
   */
  className?: string;
}

/**
 * AsyncState component
 *
 * Handles loading, error, and empty states for async data.
 * Renders children only when data is loaded, not empty, and has no errors.
 *
 * @example
 * ```tsx
 * <AsyncState
 *   isLoading={isLoading}
 *   error={error}
 *   isEmpty={tables.length === 0}
 *   emptyMessage="No tables found"
 * >
 *   <TablesList tables={tables} />
 * </AsyncState>
 * ```
 */
export function AsyncState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'No items found.',
  loadingMessage = 'Loading...',
  errorMessage,
  children,
  className = '',
}: AsyncStateProps) {
  if (isLoading) {
    return (
      <div className={`async-state-loading ${className}`}>
        <p>{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`async-state-error ${className}`}>
        <p>{errorMessage || `Error: ${error}`}</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={`async-state-empty ${className}`}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}

