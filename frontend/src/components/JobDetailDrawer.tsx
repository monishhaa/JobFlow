import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, CustomApiError } from '../lib/api';
import { Job, Execution } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatRelativeTime, formatExactLocalTime, formatDuration, formatPriority } from '../lib/utils';
import { Drawer } from './Drawer';
import { Skeleton, InlineError } from './UIState';

interface JobDetailDrawerProps {
  jobId: string;
  onClose: () => void;
  onClone?: (job: Job) => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({ jobId, onClose, onClone }) => {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch job details
  const {
    data: job,
    isLoading: isJobLoading,
    error: jobError,
    refetch: refetchJob,
  } = useQuery<Job>({
    queryKey: ['job', jobId],
    queryFn: () => apiFetch<Job>(`/jobs/${jobId}`),
  });

  // Fetch job execution history
  const {
    data: executions,
    isLoading: isExecutionsLoading,
    refetch: refetchExecutions,
  } = useQuery<Execution[]>({
    queryKey: ['job', jobId, 'executions'],
    queryFn: () => apiFetch<Execution[]>(`/jobs/${jobId}/executions`),
    enabled: !!jobId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setActionError(null);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel job');
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setActionError(null);
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to retry job');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/jobs/${jobId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to delete job');
    },
  });

  const isQueued = job?.status === 'QUEUED';
  const isRetrying = job?.status === 'QUEUED' && job.attempts > 0;
  const isFinished = job?.status === 'SUCCEEDED' || job?.status === 'DEAD' || job?.status === 'CANCELLED';
  const canRetry = job?.status === 'DEAD' || job?.status === 'CANCELLED' || isRetrying;

  const durationMs = job?.startedAt && job?.finishedAt
    ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
    : null;

  return (
    <Drawer isOpen={true} onClose={onClose} title={`Job ${jobId}`} width="w-full max-w-2xl">
      {isJobLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : jobError ? (
        <InlineError
          message="Failed to load job details."
          onRetry={() => {
            refetchJob();
            refetchExecutions();
          }}
        />
      ) : job ? (
        <div className="space-y-6 text-13">
          {actionError && (
            <div className="p-3 bg-status-dead/10 border border-status-dead/20 text-status-dead rounded text-12 font-mono">
              {actionError}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <StatusBadge status={job.status} attempts={job.attempts} />
              <span className="text-12 font-mono px-2 py-0.5 border border-border rounded bg-page">
                {formatPriority(job.priority).label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isQueued && (
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="px-2.5 py-1 text-12 font-medium border border-border rounded hover:bg-page"
                >
                  Cancel
                </button>
              )}
              {canRetry && (
                <button
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  className="px-2.5 py-1 text-12 font-medium bg-accent text-white rounded hover:bg-accent-hover"
                >
                  Retry Now
                </button>
              )}
              {onClone && (
                <button
                  onClick={() => onClone(job)}
                  className="px-2.5 py-1 text-12 font-medium border border-border rounded hover:bg-page"
                >
                  Clone
                </button>
              )}
              {isFinished && (
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="px-2.5 py-1 text-12 font-medium text-status-dead border border-status-dead/30 rounded hover:bg-status-dead/5"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Key metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-page border border-border rounded text-12">
            <div>
              <div className="text-muted font-mono mb-0.5">TYPE</div>
              <div className="font-semibold text-ink font-mono">{job.type}</div>
            </div>
            <div>
              <div className="text-muted font-mono mb-0.5">ATTEMPTS</div>
              <div className="text-ink font-mono tabular-nums">
                {job.attempts} / {job.maxAttempts}
              </div>
            </div>
            <div>
              <div className="text-muted font-mono mb-0.5">TIMEOUT</div>
              <div className="text-ink font-mono tabular-nums">{job.timeoutSeconds}s</div>
            </div>
            <div>
              <div className="text-muted font-mono mb-0.5">CREATED</div>
              <div className="text-ink" title={formatExactLocalTime(job.createdAt)}>
                {formatRelativeTime(job.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-muted font-mono mb-0.5">DURATION</div>
              <div className="text-ink font-mono tabular-nums">{formatDuration(durationMs)}</div>
            </div>
            {job.workerId && (
              <div>
                <div className="text-muted font-mono mb-0.5">WORKER</div>
                <div className="text-ink font-mono truncate" title={job.workerId}>
                  {job.workerId}
                </div>
              </div>
            )}
            {job.nextRunAt && (
              <div>
                <div className="text-muted font-mono mb-0.5">NEXT RUN</div>
                <div className="text-ink font-mono" title={formatExactLocalTime(job.nextRunAt)}>
                  {formatRelativeTime(job.nextRunAt)}
                </div>
              </div>
            )}
            {job.idempotencyKey && (
              <div className="col-span-2">
                <div className="text-muted font-mono mb-0.5">IDEMPOTENCY KEY</div>
                <div className="text-ink font-mono text-12 truncate" title={job.idempotencyKey}>
                  {job.idempotencyKey}
                </div>
              </div>
            )}
            {job.callbackUrl && (
              <div className="col-span-2">
                <div className="text-muted font-mono mb-0.5">CALLBACK URL</div>
                <div className="text-ink font-mono text-12 truncate" title={job.callbackUrl}>
                  {job.callbackUrl}
                </div>
              </div>
            )}
          </div>

          {/* Last Error */}
          {job.lastError && (
            <div>
              <h3 className="text-12 font-semibold text-status-dead mb-2 uppercase font-mono tracking-wider">
                Last Error
              </h3>
              <pre className="p-3 bg-status-dead/5 border border-status-dead/20 rounded font-mono text-12 text-status-dead overflow-x-auto whitespace-pre-wrap">
                {job.lastError}
              </pre>
            </div>
          )}

          {/* Result */}
          {job.result !== undefined && job.result !== null && (
            <div>
              <h3 className="text-12 font-semibold text-ink mb-2 uppercase font-mono tracking-wider">
                Execution Result
              </h3>
              <pre className="p-3 bg-page border border-border rounded font-mono text-12 text-ink overflow-x-auto">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Payload */}
          <div>
            <h3 className="text-12 font-semibold text-ink mb-2 uppercase font-mono tracking-wider">
              Payload
            </h3>
            <pre className="p-3 bg-page border border-border rounded font-mono text-12 text-ink overflow-x-auto">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>

          {/* Execution History */}
          <div>
            <h3 className="text-12 font-semibold text-ink mb-2 uppercase font-mono tracking-wider">
              Execution History
            </h3>
            {isExecutionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !executions || executions.length === 0 ? (
              <p className="text-12 text-muted italic">No execution attempts recorded yet.</p>
            ) : (
              <div className="border border-border rounded divide-y divide-border">
                {executions.map((exec, idx) => {
                  const execDuration = exec.startedAt && exec.finishedAt
                    ? new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()
                    : null;
                  return (
                    <div key={idx} className="p-3 text-12">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-semibold text-ink">
                          Attempt #{exec.attempt}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            exec.status === 'SUCCEEDED'
                              ? 'text-status-succeeded'
                              : 'text-status-dead'
                          }`}
                        >
                          {exec.status}
                        </span>
                      </div>
                      <div className="text-muted text-12 flex items-center justify-between font-mono">
                        <span title={formatExactLocalTime(exec.startedAt)}>
                          {formatRelativeTime(exec.startedAt)}
                        </span>
                        <span>{formatDuration(execDuration)}</span>
                      </div>
                      {exec.workerId && (
                        <div className="text-muted font-mono text-12 mt-1">
                          Worker: <span className="text-ink">{exec.workerId}</span>
                        </div>
                      )}
                      {exec.error && (
                        <div className="mt-2 p-2 bg-status-dead/5 border border-status-dead/20 rounded font-mono text-status-dead text-12 whitespace-pre-wrap">
                          {exec.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
};
