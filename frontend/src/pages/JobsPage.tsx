import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Job, PaginatedResult } from '../types';
import { StatusDot } from '../components/StatusDot';
import { RelativeTime } from '../components/RelativeTime';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { TableSkeleton, EmptyState, InlineError } from '../components/UIState';
import { formatDuration } from '../lib/utils';
import { NewJobModal } from '../components/NewJobModal';

export const JobsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters state
  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('type') || '';
  const searchQuery = searchParams.get('q') || '';
  const sortBy = searchParams.get('sort') || 'createdAt';
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc') || 'desc';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const size = 20;

  // Debounced search input
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (searchInput.trim()) {
          next.set('q', searchInput.trim());
        } else {
          next.delete('q');
        }
        next.set('page', '0');
        return next;
      });
    }, 250);

    return () => clearTimeout(handler);
  }, [searchInput, setSearchParams]);

  // Fetch job types
  const { data: jobTypes } = useQuery<string[]>({
    queryKey: ['jobTypes'],
    queryFn: () => apiFetch<string[]>('/jobs/types'),
  });

  // Query jobs
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (searchQuery) params.set('q', searchQuery);
    params.set('sort', sortBy);
    params.set('dir', sortDir);
    params.set('page', page.toString());
    params.set('size', size.toString());
    return params.toString();
  }, [statusFilter, typeFilter, searchQuery, sortBy, sortDir, page]);

  const {
    data: jobsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PaginatedResult<Job>>({
    queryKey: ['jobs', queryParams],
    queryFn: () => apiFetch<PaginatedResult<Job>>(`/jobs?${queryParams}`),
  });

  // Requeue dead jobs mutation
  const requeueDeadMutation = useMutation({
    mutationFn: () => apiFetch<{ requeued: number }>('/jobs/requeue-dead', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      alert(`Requeued ${data.requeued} dead jobs.`);
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to requeue dead jobs');
    },
  });

  // Quick submit demo jobs mutation
  const submitDemoJobMutation = useMutation({
    mutationFn: (body: { type: string; payload: Record<string, unknown>; priority?: string; maxAttempts?: number; timeoutSeconds?: number; runAt?: string }) =>
      apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to submit demo job');
    },
  });

  const totalPages = jobsData ? Math.ceil(jobsData.total / size) : 0;

  const handleSort = (field: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (sortBy === field) {
        next.set('dir', sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        next.set('sort', field);
        next.set('dir', 'desc');
      }
      return next;
    });
  };

  const setStatus = (status: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (status) {
        next.set('status', status);
      } else {
        next.delete('status');
      }
      next.set('page', '0');
      return next;
    });
  };

  const setType = (type: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (type) {
        next.set('type', type);
      } else {
        next.delete('type');
      }
      next.set('page', '0');
      return next;
    });
  };

  const statusChips = [
    { label: 'All', value: '' },
    { label: 'Queued', value: 'QUEUED' },
    { label: 'Running', value: 'RUNNING' },
    { label: 'Retrying', value: 'RETRYING' },
    { label: 'Succeeded', value: 'SUCCEEDED' },
    { label: 'Dead', value: 'DEAD' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-20 font-semibold text-ink tracking-tight">Jobs</h1>
          <p className="text-13 text-muted">
            Manage, inspect, and monitor background tasks across the cluster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => requeueDeadMutation.mutate()}
            disabled={requeueDeadMutation.isPending}
          >
            {requeueDeadMutation.isPending ? 'Requeuing...' : 'Requeue all dead'}
          </Button>
          <Button variant="primary" onClick={() => setIsNewJobModalOpen(true)}>
            New job
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="space-y-3 bg-panel p-4 border border-border rounded">
        {/* Status Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-12 font-mono text-muted mr-1">STATUS:</span>
          {statusChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStatus(chip.value)}
              className={`px-2.5 py-1 rounded text-12 font-medium border transition-colors ${
                statusFilter === chip.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-page text-muted border-border hover:text-ink'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search and Job Type Select */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          <div className="flex-1 min-w-[220px]">
            <Input
              id="global-search-input"
              type="text"
              placeholder="Search payload, error, or id... (Press '/' to focus)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="w-48">
            <Select
              value={typeFilter}
              onChange={(e) => setType(e.target.value)}
              aria-label="Job Type"
            >
              <option value="">All Types</option>
              {jobTypes?.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          {(statusFilter || typeFilter || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setSearchParams({});
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Sortable Table */}
      {isLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : isError ? (
        <InlineError
          message={error instanceof Error ? error.message : 'Error fetching jobs'}
          onRetry={() => refetch()}
        />
      ) : !jobsData || jobsData.items.length === 0 ? (
        statusFilter || typeFilter || searchQuery ? (
          <EmptyState
            title="No jobs found"
            message="No jobs match your current search and filter criteria."
          />
        ) : (
          <div className="py-12 px-6 text-center border border-dashed border-border rounded bg-panel space-y-4">
            <p className="text-14 font-semibold text-ink">
              No jobs yet. Submit one to see it here.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={submitDemoJobMutation.isPending}
                onClick={() =>
                  submitDemoJobMutation.mutate({
                    type: 'DEMO_FLAKY',
                    payload: { durationSec: 1, failRate: 0.0 },
                    maxAttempts: 3,
                  })
                }
              >
                Try a quick job
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={submitDemoJobMutation.isPending}
                onClick={() =>
                  submitDemoJobMutation.mutate({
                    type: 'DEMO_FLAKY',
                    payload: { durationSec: 1, failRate: 1.0 },
                    maxAttempts: 3,
                  })
                }
              >
                Try a failing job
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={submitDemoJobMutation.isPending}
                onClick={() =>
                  submitDemoJobMutation.mutate({
                    type: 'DEMO_FLAKY',
                    payload: { durationSec: 1, failRate: 0.0 },
                    maxAttempts: 3,
                    runAt: new Date(Date.now() + 60000).toISOString(),
                  })
                }
              >
                Try a delayed job
              </Button>
            </div>
          </div>
        )
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead
                className="cursor-pointer hover:text-ink w-24"
                onClick={() => handleSort('id')}
              >
                ID
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-ink"
                onClick={() => handleSort('type')}
              >
                Type {sortBy === 'type' && (sortDir === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-ink"
                onClick={() => handleSort('status')}
              >
                Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-ink"
                onClick={() => handleSort('attempts')}
              >
                Attempts {sortBy === 'attempts' && (sortDir === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-ink"
                onClick={() => handleSort('createdAt')}
              >
                Created {sortBy === 'createdAt' && (sortDir === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {jobsData.items.map((job) => {
              const durationMs =
                job.startedAt && job.finishedAt
                  ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
                  : null;

              return (
                <TableRow
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-12 text-muted">
                    {job.id.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="font-mono text-13 font-medium text-ink">
                    {job.type}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusDot status={job.status} attempts={job.attempts} />
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-12 text-ink">
                    {job.attempts} / {job.maxAttempts}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <RelativeTime date={job.createdAt} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-12 text-muted">
                    {formatDuration(durationMs)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Pagination controls */}
      {jobsData && totalPages > 1 && (
        <div className="p-3 bg-panel border border-border rounded flex items-center justify-between text-12 font-mono text-muted">
          <div>
            Showing {jobsData.page * jobsData.size + 1} -{' '}
            {Math.min((jobsData.page + 1) * jobsData.size, jobsData.total)} of {jobsData.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', Math.max(0, page - 1).toString());
                  return next;
                })
              }
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {page + 1} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', (page + 1).toString());
                  return next;
                })
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New Job Modal Drawer */}
      {isNewJobModalOpen && (
        <NewJobModal onClose={() => setIsNewJobModalOpen(false)} />
      )}
    </div>
  );
};
