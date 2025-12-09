/**
 * Verify Page
 *
 * Public verification dashboard displaying platform metrics, activity graphs,
 * and a paginated event log for transparency and cryptographic verification.
 *
 * Features:
 * - Top-level metrics (hands played, bet volume, escrow funds, contract balance, TEE rake)
 * - Activity graphs showing hands and volume over last 48 hours
 * - Paginated event log with signature verification status
 */

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaChevronLeft,
  FaChevronRight,
  FaChevronDown,
  FaChevronUp,
  FaShieldAlt,
  FaHandPaper,
  FaCoins,
  FaWallet,
  FaFileContract,
  FaPercentage,
} from 'react-icons/fa';
import { Header } from './components/Header';
import { LoginDialog } from './components/LoginDialog';
import { formatEth } from './utils/formatEth';
import { formatAddress } from './utils/formatAddress';
import {
  getVerifyStats,
  getVerifyActivity,
  getVerifyEvents,
  type VerifyStats,
  type VerifyActivity,
  type VerifyEvent,
  type VerifyEventsResponse,
} from './services/verify';
import './Verify.css';

/**
 * Formats a timestamp for display in charts
 */
function formatHour(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: true,
  });
}

/**
 * Formats a timestamp for display in the event log
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats event kind for display
 */
function formatEventKind(kind: string): string {
  return kind
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats large numbers with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Metric card component
 */
function MetricCard({
  icon,
  label,
  value,
  subValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="verify-metric-card">
      <div className="verify-metric-icon">{icon}</div>
      <div className="verify-metric-content">
        <div className="verify-metric-label">{label}</div>
        <div className="verify-metric-value">{value}</div>
        {subValue && <div className="verify-metric-subvalue">{subValue}</div>}
      </div>
    </div>
  );
}

/**
 * Expandable event row component
 */
function EventRow({ event }: { event: VerifyEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr
        className={`verify-event-row ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="verify-event-id">#{event.eventId}</td>
        <td className="verify-event-time">{formatDateTime(event.blockTs)}</td>
        <td className="verify-event-kind">
          <span className="verify-event-kind-badge">{formatEventKind(event.kind)}</span>
        </td>
        <td className="verify-event-player">
          {event.player ? formatAddress(event.player) : '—'}
        </td>
        <td className="verify-event-signature">
          {event.signatureValid ? (
            <span className="verify-signature-valid">
              <FaCheckCircle /> Valid
            </span>
          ) : (
            <span className="verify-signature-invalid">
              <FaTimesCircle /> Invalid
            </span>
          )}
        </td>
        <td className="verify-event-expand">
          {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
        </td>
      </tr>
      {isExpanded && (
        <tr className="verify-event-details-row">
          <td colSpan={6}>
            <div className="verify-event-details">
              <div className="verify-event-detail-group">
                <div className="verify-event-detail">
                  <span className="verify-detail-label">Digest:</span>
                  <code className="verify-detail-value">{event.digest}</code>
                </div>
                <div className="verify-event-detail">
                  <span className="verify-detail-label">TEE Pubkey:</span>
                  <code className="verify-detail-value">{event.teePubkey}</code>
                </div>
                <div className="verify-event-detail">
                  <span className="verify-detail-label">TEE Version:</span>
                  <span className="verify-detail-value">{event.teeVersion}</span>
                </div>
              </div>
              <div className="verify-event-detail-group">
                <div className="verify-event-detail">
                  <span className="verify-detail-label">Signature R:</span>
                  <code className="verify-detail-value verify-detail-truncate">{event.sigR}</code>
                </div>
                <div className="verify-event-detail">
                  <span className="verify-detail-label">Signature S:</span>
                  <code className="verify-detail-value verify-detail-truncate">{event.sigS}</code>
                </div>
                <div className="verify-event-detail">
                  <span className="verify-detail-label">Signature V:</span>
                  <span className="verify-detail-value">{event.sigV}</span>
                </div>
              </div>
              <div className="verify-event-payload">
                <span className="verify-detail-label">Payload:</span>
                <pre className="verify-payload-json">
                  {JSON.stringify(JSON.parse(event.payloadJson), null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Verify Page Component
 */
function Verify() {
  // State for stats
  const [stats, setStats] = useState<VerifyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // State for activity
  const [activity, setActivity] = useState<VerifyActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  // State for events
  const [eventsResponse, setEventsResponse] = useState<VerifyEventsResponse | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 20;

  // State for login dialog
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);

  // Fetch stats on mount
  useEffect(() => {
    async function fetchStats() {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const data = await getVerifyStats();
        setStats(data);
      } catch (err) {
        setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Fetch activity on mount
  useEffect(() => {
    async function fetchActivity() {
      setActivityLoading(true);
      setActivityError(null);
      try {
        const data = await getVerifyActivity();
        setActivity(data);
      } catch (err) {
        setActivityError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        setActivityLoading(false);
      }
    }
    fetchActivity();
  }, []);

  // Fetch events when page changes
  useEffect(() => {
    async function fetchEvents() {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const data = await getVerifyEvents(currentPage, eventsPerPage);
        setEventsResponse(data);
      } catch (err) {
        setEventsError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        setEventsLoading(false);
      }
    }
    fetchEvents();
  }, [currentPage]);

  // Prepare chart data
  const handsChartData = activity?.handsPerHour.map(h => ({
    hour: formatHour(h.hour),
    hands: h.count,
  })) || [];

  const volumeChartData = activity?.volumePerHour.map(v => ({
    hour: formatHour(v.hour),
    volume: Number(BigInt(v.volumeGwei)) / 1e9, // Convert to ETH for display
  })) || [];

  return (
    <div className="verify-page">
      <Header onLoginClick={() => setIsLoginDialogOpen(true)} />
      
      <main className="verify-main">
        <div className="verify-header">
          <div className="verify-header-icon">
            <FaShieldAlt />
          </div>
          <div className="verify-header-content">
            <h1 className="verify-title">Platform Verification</h1>
            <p className="verify-subtitle">
              Transparent metrics and cryptographically signed events for public verification
            </p>
          </div>
        </div>

        {/* Metrics Section */}
        <section className="verify-section">
          <h2 className="verify-section-title">Platform Metrics</h2>
          {statsLoading ? (
            <div className="verify-loading">
              <FaSpinner className="verify-spinner" />
              <span>Loading metrics...</span>
            </div>
          ) : statsError ? (
            <div className="verify-error">{statsError}</div>
          ) : stats ? (
            <div className="verify-metrics-grid">
              <MetricCard
                icon={<FaHandPaper />}
                label="Hands Played"
                value={formatNumber(stats.handsPlayed)}
              />
              <MetricCard
                icon={<FaCoins />}
                label="Total Bet Volume"
                value={formatEth(stats.totalBetVolumeGwei)}
              />
              <MetricCard
                icon={<FaWallet />}
                label="Total Escrow Funds"
                value={formatEth(stats.totalEscrowFundsGwei)}
                subValue="(Escrow + Table Stacks)"
              />
              <MetricCard
                icon={<FaFileContract />}
                label="Contract Balance"
                value={formatEth(stats.contractBalanceGwei)}
              />
              <MetricCard
                icon={<FaPercentage />}
                label="TEE Rake Balance"
                value={formatEth(stats.teeRakeBalanceGwei)}
              />
            </div>
          ) : null}
        </section>

        {/* Activity Charts Section */}
        <section className="verify-section">
          <h2 className="verify-section-title">Activity (Last 48 Hours)</h2>
          {activityLoading ? (
            <div className="verify-loading">
              <FaSpinner className="verify-spinner" />
              <span>Loading activity data...</span>
            </div>
          ) : activityError ? (
            <div className="verify-error">{activityError}</div>
          ) : activity ? (
            <div className="verify-charts-grid">
              <div className="verify-chart-container">
                <h3 className="verify-chart-title">Hands Completed</h3>
                {handsChartData.length === 0 ? (
                  <div className="verify-chart-empty">No hands in the last 48 hours</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={handsChartData}>
                      <defs>
                        <linearGradient id="handsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis
                        dataKey="hour"
                        stroke="rgba(255,255,255,0.5)"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.5)"
                        fontSize={12}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(20, 20, 20, 0.95)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#ffffff' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="hands"
                        stroke="#8b5cf6"
                        fill="url(#handsGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="verify-chart-container">
                <h3 className="verify-chart-title">Bet Volume (ETH)</h3>
                {volumeChartData.length === 0 ? (
                  <div className="verify-chart-empty">No betting activity in the last 48 hours</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={volumeChartData}>
                      <defs>
                        <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d4af37" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#d4af37" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis
                        dataKey="hour"
                        stroke="rgba(255,255,255,0.5)"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.5)"
                        fontSize={12}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(20, 20, 20, 0.95)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#ffffff' }}
                        formatter={(value: number) => [`${value.toFixed(4)} ETH`, 'Volume']}
                      />
                      <Area
                        type="monotone"
                        dataKey="volume"
                        stroke="#d4af37"
                        fill="url(#volumeGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* Events Log Section */}
        <section className="verify-section">
          <h2 className="verify-section-title">Event Log</h2>
          <p className="verify-section-description">
            All platform events are cryptographically signed by the TEE. Click any row to view signature details.
          </p>
          
          {eventsLoading && !eventsResponse ? (
            <div className="verify-loading">
              <FaSpinner className="verify-spinner" />
              <span>Loading events...</span>
            </div>
          ) : eventsError ? (
            <div className="verify-error">{eventsError}</div>
          ) : eventsResponse ? (
            <>
              <div className="verify-events-table-container">
                <table className="verify-events-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Player</th>
                      <th>Signature</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsResponse.events.map(event => (
                      <EventRow key={event.eventId} event={event} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="verify-pagination">
                <button
                  className="verify-pagination-button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || eventsLoading}
                >
                  <FaChevronLeft /> Previous
                </button>
                <span className="verify-pagination-info">
                  Page {eventsResponse.page} of {eventsResponse.totalPages}
                  <span className="verify-pagination-total">
                    ({formatNumber(eventsResponse.totalCount)} events)
                  </span>
                </span>
                <button
                  className="verify-pagination-button"
                  onClick={() => setCurrentPage(p => Math.min(eventsResponse.totalPages, p + 1))}
                  disabled={currentPage === eventsResponse.totalPages || eventsLoading}
                >
                  Next <FaChevronRight />
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>

      {/* Login Dialog */}
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
        onLoginSuccess={() => setIsLoginDialogOpen(false)}
      />
    </div>
  );
}

export default Verify;

