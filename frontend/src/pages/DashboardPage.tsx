import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { apiFetch } from '../lib/api';
import { StatsSummary, TimeseriesPoint, PaginatedResult, Job } from '../types';
import { StatusDot } from '../components/StatusDot';
import { RelativeTime } from '../components/RelativeTime';
import { Skeleton, InlineError, EmptyState } from '../components/UIState';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  // Fetch summary stats
  const {
    data: stats,
    isLoading: isStatsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery<StatsSummary>({
    queryKey: ['stats', 'summary'],
    queryFn: () => apiFetch<StatsSummary>('/stats/summary'),
  });

  // Fetch timeseries with active range
  const {
    data: rawTimeseries,
    isLoading: isChartLoading,
  } = useQuery<TimeseriesPoint[]>({
    queryKey: ['stats', 'timeseries', timeRange],
    queryFn: () => apiFetch<TimeseriesPoint[]>(`/stats/timeseries?range=${timeRange}`),
  });

  // Fetch 5 most recent jobs
  const {
    data: recentJobs,
    isLoading: isRecentLoading,
  } = useQuery<PaginatedResult<Job>>({
    queryKey: ['jobs', 'recent'],
    queryFn: () => apiFetch<PaginatedResult<Job>>('/jobs?size=5&sort=createdAt&dir=desc'),
  });

  // Client-side zero filling and formatting for chart
  const chartData = React.useMemo(() => {
    if (!rawTimeseries || rawTimeseries.length === 0) {
      return [];
    }
    return rawTimeseries.map((pt) => {
      let formattedTime = pt.t;
      try {
        const d = new Date(pt.t);
        if (timeRange === '7d') {
          formattedTime = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } else {
          formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } catch {
        // Ignore date parsing error
      }
      return {
        ...pt,
        formattedTime,
        succeeded: pt.succeeded || 0,
        failed: pt.failed || 0,
      };
    });
  }, [rawTimeseries, timeRange]);

  const usage = stats?.usage;
  const runningPercent = usage ? Math.min(100, Math.round((usage.running / (usage.maxRunning || 1)) * 100)) : 0;
  const queuedPercent = usage ? Math.min(100, Math.round((usage.queued / (usage.maxQueued || 1)) * 100)) : 0;
  const rateLimitPercent = usage ? Math.min(100, Math.round((usage.requestsThisMinute / (usage.rateLimitPerMin || 1)) * 100)) : 0;

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
      <div>
        <h1 className="text-20 font-semibold text-ink tracking-tight">Dashboard</h1>
        <p className="text-13 text-muted">
          Cluster throughput, execution metrics, and capacity utilization.
        </p>
      </div>

      {statsError ? (
        <InlineError message="Failed to load cluster statistics." onRetry={() => refetchStats()} />
      ) : isStatsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 bg-panel border border-border rounded space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
      ) : stats ? (
        /* 1) Four bordered count tiles */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-panel border border-border rounded flex flex-col justify-between">
            <div className="text-12 font-mono text-muted uppercase">Queued</div>
            <div className="text-28 font-semibold text-ink font-mono tabular-nums mt-1">
              {stats.counts.QUEUED}
            </div>
          </div>

          <div className="p-4 bg-panel border border-border rounded flex flex-col justify-between">
            <div className="text-12 font-mono text-status-running uppercase">Running</div>
            <div className="text-28 font-semibold text-status-running font-mono tabular-nums mt-1">
              {stats.counts.RUNNING}
            </div>
          </div>

          <div className="p-4 bg-panel border border-border rounded flex flex-col justify-between">
            <div className="text-12 font-mono text-status-succeeded uppercase">Succeeded 24h</div>
            <div className="text-28 font-semibold text-status-succeeded font-mono tabular-nums mt-1">
              {stats.succeeded24h}
            </div>
          </div>

          <button
            onClick={() => navigate('/jobs?status=DEAD')}
            className="p-4 bg-panel border border-border rounded text-left hover:border-status-dead transition-colors group flex flex-col justify-between"
          >
            <div className="text-12 font-mono text-status-dead uppercase flex items-center justify-between">
              <span>Dead</span>
              <span className="text-12 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
            <div className="text-28 font-semibold text-status-dead font-mono tabular-nums mt-1">
              {stats.counts.DEAD}
            </div>
          </button>
        </div>
      ) : null}

      {/* Usage as thin progress bars */}
      {stats && (
        <div className="p-4 bg-panel border border-border rounded space-y-3">
          <div className="text-12 font-semibold text-ink uppercase tracking-wider font-mono">
            Resource Capacity & Limits
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-12 font-mono">
            {/* Running Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-muted">
                <span>RUNNING CONCURRENCY</span>
                <span className="text-ink font-semibold tabular-nums">
                  {usage?.running} / {usage?.maxRunning}
                </span>
              </div>
              <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-status-running h-full rounded-full transition-all duration-300"
                  style={{ width: `${runningPercent}%` }}
                />
              </div>
            </div>

            {/* Queued Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-muted">
                <span>QUEUE BACKLOG</span>
                <span className="text-ink font-semibold tabular-nums">
                  {usage?.queued} / {usage?.maxQueued}
                </span>
              </div>
              <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-muted h-full rounded-full transition-all duration-300"
                  style={{ width: `${queuedPercent}%` }}
                />
              </div>
            </div>

            {/* Rate Limit Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-muted">
                <span>RATE LIMIT (PER MIN)</span>
                <span className="text-ink font-semibold tabular-nums">
                  {usage?.requestsThisMinute} / {usage?.rateLimitPerMin}
                </span>
              </div>
              <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-300"
                  style={{ width: `${rateLimitPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Throughput bar chart */}
      <div className="bg-panel border border-border rounded p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-border gap-2">
          <div>
            <h2 className="text-14 font-semibold text-ink">Throughput</h2>
            <p className="text-12 text-muted">Completed vs failed background tasks across the cluster.</p>
          </div>
          {/* Plain text range switch buttons */}
          <div className="flex items-center gap-1 text-12 font-mono">
            {(['1h', '24h', '7d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  timeRange === r
                    ? 'bg-accent text-white font-semibold'
                    : 'text-muted hover:text-ink hover:bg-page'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 w-full">
          {isChartLoading ? (
            <div className="h-full flex items-center justify-center">
              <Skeleton className="h-full w-full" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-13 text-muted italic">
              No timeseries activity recorded for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="formattedTime"
                  stroke="#8A8A84"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#E4E2DC' }}
                />
                <YAxis
                  stroke="#8A8A84"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#E4E2DC' }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E4E2DC',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                  }}
                />
                <Bar
                  dataKey="succeeded"
                  name="Succeeded"
                  fill="#2F5D50"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  fill="#B0483F"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 5 Most Recent Jobs */}
      <div className="bg-panel border border-border rounded overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-14 font-semibold text-ink">Recent Jobs</h2>
          <Link to="/jobs" className="text-12 font-medium text-accent hover:underline">
            View all jobs →
          </Link>
        </div>

        {isRecentLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : !recentJobs || recentJobs.items.length === 0 ? (
          <EmptyState message="No jobs yet. Submit one to see it here." />
        ) : (
          <div className="divide-y divide-border">
            {recentJobs.items.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="p-3 px-4 flex items-center justify-between hover:bg-page transition-colors text-13"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={job.status} attempts={job.attempts} />
                  <span className="font-mono text-ink text-13">{job.type}</span>
                </div>
                <div className="flex items-center gap-4 text-12 text-muted font-mono">
                  <RelativeTime date={job.createdAt} />
                  <span className="text-muted/60">{job.id.substring(0, 8)}...</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
