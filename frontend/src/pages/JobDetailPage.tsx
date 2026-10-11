import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Job, Execution } from '../types';
import { StatusDot } from '../components/StatusDot';
import { RelativeTime } from '../components/RelativeTime';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';
import { Skeleton, InlineError } from '../components/UIState';
import { formatDuration, formatPriority, formatExactLocalTime } from '../lib/utils';
import { NewJobModal } from '../components/NewJobModal';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [cloning, setCloning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // Fetch job
  const {
    data: job,
    isLoading: isJobLoading,
    error: jobError,
    refetch: refetchJob,
  } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: () => apiFetch<Job>(`/jobs/${id}`),
    enabled: !!id,
  });

  // Fetch attempts / executions
  const {
    data: executions,
    isLoading: isExecutionsLoading,
    refetch: refetchExecutions,
  } = useQuery<Execution[]>({
    queryKey: ['job', id, 'executions'],
    queryFn: () => apiFetch<Execution[]>(`/jobs/${id}/executions`),
    enabled: !!id,
  });

  // Countdown timer for next attempt
  useEffect(() => {
    if (!job?.nextRunAt) {
      setCountdown(null);
      return;
    }

    const updateTimer = () => {
      const diffMs = new Date(job.nextRunAt!).getTime() - Date.now();
      if (diffMs <= 0) {
        setCountdown('now');
        return;
      }
      const totalSec = Math.floor(diffMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setCountdown(`${min > 0 ? `${min}m ` : ''}${sec}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [job?.nextRunAt]);

  // Optimistic Cancel Mutation with Rollback
  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${id}/cancel`, { method: 'POST' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['job', id] });
      const previousJob = queryClient.getQueryData<Job>(['job', id]);
      if (previousJob) {
        queryClient.setQueryData<Job>(['job', id], {
          ...previousJob,
          status: 'CANCELLED',
        });
      }
      return { previousJob };
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previousJob) {
        queryClient.setQueryData(['job', id], context.previousJob);
      }
      setActionError(err instanceof Error ? err.message : 'Failed to cancel job');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  // Optimistic Retry Mutation with Rollback
  const retryMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${id}/retry`, { method: 'POST' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['job', id] });
      const previousJob = queryClient.getQueryData<Job>(['job', id]);
      if (previousJob) {
        queryClient.setQueryData<Job>(['job', id], {
          ...previousJob,
          status: 'QUEUED',
          nextRunAt: null,
        });
      }
      return { previousJob };
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.previousJob) {
        queryClient.setQueryData(['job', id], context.previousJob);
      }
      setActionError(err instanceof Error ? err.message : 'Failed to retry job');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/jobs');
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to delete job');
    },
  });

  if (isJobLoading) {
    return (
      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="p-6 max-w-7xl w-full mx-auto space-y-4">
        <Link to="/jobs" className="text-12 text-accent hover:underline">
          ← Back to all jobs
        </Link>
        <InlineError
          message="Failed to load job details."
          onRetry={() => {
            refetchJob();
            refetchExecutions();
          }}
        />
      </div>
    );
  }

  const isQueued = job.status === 'QUEUED';
  const isRetrying = job.status === 'QUEUED' && job.attempts > 0;
  const isFinished = job.status === 'SUCCEEDED' || job.status === 'DEAD' || job.status === 'CANCELLED';
  const canRetry = job.status === 'DEAD' || job.status === 'CANCELLED' || isRetrying;

  const durationMs =
    job.startedAt && job.finishedAt
      ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      : null;

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6 text-13">
      {/* Top back link & Header */}
      <div className="space-y-3">
        <Link to="/jobs" className="text-12 text-accent hover:underline inline-block">
          ← Back to Jobs
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-20 font-semibold text-ink font-mono">{job.type}</h1>
              <StatusDot status={job.status} attempts={job.attempts} />
            </div>
            {/* Meta Line */}
            <div className="text-12 text-muted font-mono flex flex-wrap items-center gap-2 mt-1">
              <span>ID: {job.id}</span>
              <span>•</span>
              <span>
                Created: <RelativeTime date={job.createdAt} />
              </span>
              <span>•</span>
              <span>Duration: {formatDuration(durationMs)}</span>
              <span>•</span>
              <span>Priority: {formatPriority(job.priority).label}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isQueued && (
              <Button
                variant="secondary"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Job'}
              </Button>
            )}
            {canRetry && (
              <Button
                variant="primary"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
              >
                {retryMutation.isPending ? 'Retrying...' : 'Retry Now'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setCloning(true)}>
              Clone
            </Button>
            {isFinished && (
              <Button
                variant="danger"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm('Permanently delete this finished job?')) {
                    deleteMutation.mutate();
                  }
                }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {actionError && <InlineError message={actionError} />}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Payloads, Results & Attempts table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Last Error */}
          {job.lastError && (
            <div className="space-y-2">
              <h2 className="text-12 font-semibold text-status-dead uppercase font-mono tracking-wider">
                Last Error
              </h2>
              <div className="p-3 bg-status-dead/5 border border-status-dead/20 rounded font-mono text-12 text-status-dead whitespace-pre-wrap">
                {job.lastError}
              </div>
            </div>
          )}

          {/* Payload Code Block */}
          <div className="space-y-2">
            <h2 className="text-12 font-semibold text-ink uppercase font-mono tracking-wider">
              Input Payload
            </h2>
            <CodeBlock code={job.payload} />
          </div>

          {/* Result Code Block */}
          {job.result !== undefined && job.result !== null && (
            <div className="space-y-2">
              <h2 className="text-12 font-semibold text-ink uppercase font-mono tracking-wider">
                Execution Result
              </h2>
              <CodeBlock code={job.result} />
            </div>
          )}

          {/* Attempts Table */}
          <div className="space-y-2">
            <h2 className="text-12 font-semibold text-ink uppercase font-mono tracking-wider">
              Execution Attempts
            </h2>
            {isExecutionsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !executions || executions.length === 0 ? (
              <div className="p-4 border border-border rounded bg-panel text-12 text-muted italic">
                No attempt records found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Attempt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Worker</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {executions.map((exec, idx) => {
                    const execDuration =
                      exec.startedAt && exec.finishedAt
                        ? new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()
                        : null;

                    // LEASE_LOST shown as "Worker lost"
                    const displayStatus =
                      exec.status === 'LEASE_LOST' ? 'Worker lost' : exec.status;

                    return (
                      <React.Fragment key={idx}>
                        <TableRow>
                          <TableCell className="font-mono text-12 font-semibold text-ink">
                            #{exec.attempt}
                          </TableCell>
                          <TableCell className="font-mono text-12">
                            <span
                              className={
                                exec.status === 'SUCCEEDED'
                                  ? 'text-status-succeeded font-semibold'
                                  : 'text-status-dead font-semibold'
                              }
                            >
                              {displayStatus}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-12 text-muted">
                            {exec.workerId || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <RelativeTime date={exec.startedAt} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-12 text-muted">
                            {formatDuration(execDuration)}
                          </TableCell>
                        </TableRow>
                        {exec.error && (
                          <tr className="bg-status-dead/5">
                            <td colSpan={5} className="p-3 text-12 font-mono text-status-dead border-b border-border whitespace-pre-wrap">
                              {exec.error}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Right Details Column */}
        <div className="space-y-4">
          <div className="bg-panel border border-border rounded p-4 space-y-4">
            <h2 className="text-12 font-semibold text-ink uppercase font-mono tracking-wider">
              Job Details
            </h2>

            <div className="space-y-3 font-mono text-12 divide-y divide-border">
              <div className="flex justify-between pt-2">
                <span className="text-muted">ATTEMPTS</span>
                <span className="text-ink font-semibold tabular-nums">
                  {job.attempts} / {job.maxAttempts}
                </span>
              </div>

              <div className="flex justify-between pt-2">
                <span className="text-muted">TIMEOUT</span>
                <span className="text-ink tabular-nums">{job.timeoutSeconds}s</span>
              </div>

              {job.nextRunAt && (
                <div className="flex justify-between pt-2">
                  <span className="text-muted">NEXT ATTEMPT</span>
                  <span className="text-status-retrying font-semibold tabular-nums" title={formatExactLocalTime(job.nextRunAt)}>
                    {countdown ? `in ${countdown}` : <RelativeTime date={job.nextRunAt} />}
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <span className="text-muted">LAST WORKER</span>
                <span className="text-ink truncate max-w-[150px]" title={job.workerId || ''}>
                  {job.workerId || '—'}
                </span>
              </div>

              <div className="pt-2">
                <div className="text-muted mb-1">IDEMPOTENCY KEY</div>
                <div className="text-ink truncate select-all" title={job.idempotencyKey || ''}>
                  {job.idempotencyKey || '—'}
                </div>
              </div>

              <div className="pt-2">
                <div className="text-muted mb-1">CALLBACK URL</div>
                <div className="text-ink truncate select-all" title={job.callbackUrl || ''}>
                  {job.callbackUrl || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clone Job Modal */}
      {cloning && (
        <NewJobModal
          defaultJobType={job.type}
          defaultPayload={JSON.stringify(job.payload, null, 2)}
          onClose={() => setCloning(false)}
        />
      )}
    </div>
  );
};
