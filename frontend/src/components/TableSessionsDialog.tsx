/**
 * Table Sessions Dialog component
 *
 * Displays all player sessions (active and inactive) for a poker table in a table format.
 * Used by admin interface to view detailed session information.
 */

import { useState, useEffect } from 'react';
import { getTableSessions, type TableSeatSession } from '../services/tables';
import { formatAddress } from '../utils/formatAddress';
import { formatGwei } from '../utils/formatGwei';
import './TableSessionsDialog.css';

/**
 * Props for TableSessionsDialog component
 */
export interface TableSessionsDialogProps {
  /**
   * Whether the dialog is open
   */
  isOpen: boolean;
  /**
   * Callback when dialog is closed
   */
  onClose: () => void;
  /**
   * Table ID to fetch sessions for
   */
  tableId: number;
  /**
   * Table name to display in header
   */
  tableName: string;
  /**
   * Admin session signature for authentication
   */
  signature: string;
  /**
   * Admin wallet address
   */
  adminAddress: string;
}

/**
 * Table Sessions Dialog component
 *
 * Fetches and displays all seat sessions for a poker table in a table format.
 * Shows both active and inactive sessions with all session details.
 */
export function TableSessionsDialog({
  isOpen,
  onClose,
  tableId,
  tableName,
  signature,
  adminAddress,
}: TableSessionsDialogProps) {
  const [sessions, setSessions] = useState<TableSeatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches table sessions when dialog opens
   */
  useEffect(() => {
    if (!isOpen || !signature || !adminAddress) {
      return;
    }

    async function fetchSessions() {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedSessions = await getTableSessions(tableId, signature, adminAddress);
        setSessions(fetchedSessions);
      } catch (err) {
        console.error('Failed to fetch table sessions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSessions();
  }, [isOpen, tableId, signature, adminAddress]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="table-sessions-dialog-overlay" onClick={onClose}>
      <div className="table-sessions-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="table-sessions-dialog-header">
          <h2>Table Sessions: {tableName}</h2>
          <button
            className="table-sessions-dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="table-sessions-dialog-content">
          {isLoading ? (
            <div className="table-sessions-loading">
              <p>Loading sessions...</p>
            </div>
          ) : error ? (
            <div className="table-sessions-error">
              <p>Error: {error}</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="table-sessions-empty">
              <p>No sessions found for this table.</p>
            </div>
          ) : (
            <div className="table-sessions-table-container">
              <table className="table-sessions-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Seat</th>
                    <th>Wallet Address</th>
                    <th>Twitter Handle</th>
                    <th>Balance (gwei)</th>
                    <th>Status</th>
                    <th>Joined At</th>
                    <th>Left At</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className={session.isActive ? 'table-sessions-row-active' : ''}>
                      <td className="table-sessions-id">{session.id}</td>
                      <td className="table-sessions-seat">{session.seatNumber}</td>
                      <td className="table-sessions-wallet">
                        <code>{formatAddress(session.walletAddress)}</code>
                      </td>
                      <td className="table-sessions-twitter">
                        {session.twitterHandle ? (
                          <a
                            href={`https://twitter.com/${session.twitterHandle.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="table-sessions-twitter-link"
                          >
                            {session.twitterHandle}
                          </a>
                        ) : (
                          <span className="table-sessions-no-handle">-</span>
                        )}
                      </td>
                      <td className="table-sessions-balance">
                        {formatGwei(session.tableBalanceGwei)}
                      </td>
                      <td className="table-sessions-status">
                        <span className={`table-sessions-status-badge ${session.isActive ? 'active' : 'inactive'}`}>
                          {session.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-sessions-joined">
                        {new Date(session.joinedAt).toLocaleString()}
                      </td>
                      <td className="table-sessions-left">
                        {session.leftAt ? new Date(session.leftAt).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="table-sessions-dialog-footer">
          <button
            className="table-sessions-dialog-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

