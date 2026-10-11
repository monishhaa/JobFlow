import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Schedule } from '../types';
import { TableSkeleton, EmptyState, InlineError } from '../components/UIState';
import { Drawer } from '../components/Drawer';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';
import { RelativeTime } from '../components/RelativeTime';
import { formatExactLocalTime } from '../lib/utils';

export const SchedulesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 0 9 * * MON-FRI');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [jobType, setJobType] = useState('');
  const [payload, setPayload] = useState('{\n  \n}');
  const [enabled, setEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Live cron preview query from /schedules/preview
  const { data: previewRuns, isFetching: isPreviewFetching } = useQuery<string[]>({
    queryKey: ['schedules', 'preview', cronExpr, timezone],
    queryFn: () =>
      apiFetch<string[]>(
        `/schedules/preview?cron=${encodeURIComponent(cronExpr.trim())}&tz=${encodeURIComponent(
          timezone.trim()
        )}`
      ),
    enabled: cronExpr.trim().split(/\s+/).length >= 5 && !!timezone,
    retry: false,
  });

  // Query schedules
  const {
    data: schedules,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Schedule[]>({
    queryKey: ['schedules'],
    queryFn: () => apiFetch<Schedule[]>('/schedules'),
  });

  // Save/Edit mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload = {};
      if (payload.trim()) {
        try {
          parsedPayload = JSON.parse(payload);
        } catch {
          throw new Error('Payload must be valid JSON');
        }
      }

      const body = {
        name: name.trim(),
        cronExpr: cronExpr.trim(),
        timezone: timezone.trim(),
        jobType: jobType.trim(),
        payload: parsedPayload,
        enabled,
      };

      if (editingSchedule) {
        return apiFetch(`/schedules/${editingSchedule.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        return apiFetch('/schedules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      handleCloseDrawer();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to save schedule');
    },
  });

  // Toggle enabled mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to delete schedule');
    },
  });

  const handleOpenNew = () => {
    setName('');
    setCronExpr('0 0 9 * * MON-FRI');
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    setJobType('');
    setPayload('{\n  \n}');
    setEnabled(true);
    setFormError(null);
    setEditingSchedule(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (sched: Schedule) => {
    setEditingSchedule(sched);
    setName(sched.name);
    setCronExpr(sched.cronExpr);
    setTimezone(sched.timezone || 'UTC');
    setJobType(sched.jobType);
    setPayload(JSON.stringify(sched.payload || {}, null, 2));
    setEnabled(sched.enabled);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingSchedule(null);
    setFormError(null);
  };

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-20 font-semibold text-ink tracking-tight">Schedules</h1>
          <p className="text-13 text-muted">
            Configure automated recurring job schedules using Spring 6-field cron expressions.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenNew}>
          Create schedule
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : isError ? (
        <InlineError
          message={error instanceof Error ? error.message : 'Error fetching schedules'}
          onRetry={() => refetch()}
        />
      ) : !schedules || schedules.length === 0 ? (
        <EmptyState
          title="No schedules yet"
          message="Automate background tasks by defining cron triggers."
          action={
            <Button variant="secondary" onClick={handleOpenNew}>
              Create your first schedule
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead className="w-24">Enable</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Job Type</TableHead>
              <TableHead>Cron Expression</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {schedules.map((sched) => (
              <TableRow key={sched.id}>
                <TableCell>
                  <button
                    onClick={() =>
                      toggleMutation.mutate({ id: sched.id, enabled: !sched.enabled })
                    }
                    className={`text-12 font-mono font-semibold px-2 py-0.5 rounded border transition-colors ${
                      sched.enabled
                        ? 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20'
                        : 'bg-page border-border text-muted hover:text-ink'
                    }`}
                  >
                    {sched.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </TableCell>
                <TableCell className="font-semibold text-ink">{sched.name}</TableCell>
                <TableCell className="font-mono text-12 text-ink">{sched.jobType}</TableCell>
                <TableCell className="font-mono text-12 text-muted">{sched.cronExpr}</TableCell>
                <TableCell className="font-mono text-12 text-muted">{sched.timezone}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <RelativeTime date={sched.nextRunAt} />
                </TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => handleOpenEdit(sched)}
                    className="text-12 font-medium text-accent hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete recurring schedule "${sched.name}"?`)) {
                        deleteMutation.mutate(sched.id);
                      }
                    }}
                    className="text-12 font-medium text-status-dead hover:underline"
                  >
                    Delete
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Drawer */}
      {isDrawerOpen && (
        <Drawer
          isOpen={true}
          onClose={handleCloseDrawer}
          title={editingSchedule ? 'Edit Schedule' : 'Create Schedule'}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFormError(null);
              saveMutation.mutate();
            }}
            className="space-y-4 text-13"
          >
            {formError && (
              <div className="p-3 bg-status-dead/10 border border-status-dead/20 text-status-dead rounded text-12 font-mono">
                {formError}
              </div>
            )}

            <Input
              label="Schedule Name *"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nightly Data Ingestion"
            />

            <Input
              label="Job Type *"
              required
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              placeholder="e.g. data.sync"
              className="font-mono text-13"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Cron Expression (6-field) *"
                required
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 0 9 * * MON-FRI"
                className="font-mono text-12"
              />

              <Input
                label="Timezone *"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC or America/New_York"
                className="font-mono text-12"
              />
            </div>

            {/* Note about 6-field Spring format */}
            <div className="p-3 bg-page border border-border rounded text-12 space-y-1">
              <div className="font-semibold text-ink font-mono">Spring 6-Field Cron Format:</div>
              <div className="font-mono text-muted">
                <code>sec min hour day-of-month month day-of-week</code>
              </div>
              <p className="text-muted text-12">
                e.g. <code>0 0 9 * * MON-FRI</code> (9am weekdays) or <code>0 */5 * * * *</code> (every 5 min). Minimum interval is 1 minute.
              </p>
            </div>

            {/* Live Cron Preview Box */}
            <div className="p-3 bg-page border border-border rounded">
              <div className="text-12 font-mono text-muted mb-2 flex items-center justify-between">
                <span>UPCOMING SCHEDULED RUNS PREVIEW</span>
                {isPreviewFetching && <span className="text-12">Updating...</span>}
              </div>
              {previewRuns && previewRuns.length > 0 ? (
                <div className="space-y-1 font-mono text-12 text-ink">
                  {previewRuns.slice(0, 5).map((run, i) => (
                    <div key={i} className="flex justify-between">
                      <span title={formatExactLocalTime(run)}>{formatExactLocalTime(run)}</span>
                      <span className="text-muted"><RelativeTime date={run} /></span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-12 text-muted italic">
                  Enter a valid 6-field cron expression to preview calculated execution times.
                </p>
              )}
            </div>

            <div>
              <label className="block text-12 font-semibold text-ink mb-1">Payload (JSON)</label>
              <textarea
                rows={4}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full px-3 py-1.5 border border-border rounded bg-panel font-mono text-12 focus:border-accent"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="sched-enabled-checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <label htmlFor="sched-enabled-checkbox" className="text-13 text-ink">
                Enable schedule immediately
              </label>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleCloseDrawer}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? 'Saving...'
                  : editingSchedule
                  ? 'Save Changes'
                  : 'Create Schedule'}
              </Button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
};
