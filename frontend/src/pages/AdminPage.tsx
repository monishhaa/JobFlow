import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { AdminUser, AdminWorker, AdminQueues, PaginatedResult } from '../types';
import { TableSkeleton, InlineError } from '../components/UIState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { RelativeTime } from '../components/RelativeTime';

export const AdminPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Active inline user editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [userMaxRunning, setUserMaxRunning] = useState<number>(5);
  const [userMaxQueued, setUserMaxQueued] = useState<number>(100);
  const [userRateLimit, setUserRateLimit] = useState<number>(60);

  // 1. Fetch Queue Depths
  const {
    data: queuesData,
    isLoading: isQueuesLoading,
    error: queuesError,
    refetch: refetchQueues,
  } = useQuery<AdminQueues>({
    queryKey: ['admin', 'queues'],
    queryFn: () => apiFetch<AdminQueues>('/admin/queues'),
    refetchInterval: 5000,
  });

  // 2. Fetch Workers (poll every 5s)
  const {
    data: workers,
    isLoading: isWorkersLoading,
    error: workersError,
    refetch: refetchWorkers,
  } = useQuery<AdminWorker[]>({
    queryKey: ['admin', 'workers'],
    queryFn: () => apiFetch<AdminWorker[]>('/admin/workers'),
    refetchInterval: 5000,
  });

  // 3. Fetch Users
  const {
    data: usersData,
    isLoading: isUsersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery<PaginatedResult<AdminUser>>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<PaginatedResult<AdminUser>>('/admin/users'),
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: userStatus,
          maxRunning: Number(userMaxRunning),
          maxQueued: Number(userMaxQueued),
          rateLimitPerMin: Number(userRateLimit),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditingUserId(null);
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to update user quota settings');
    },
  });

  const startInlineEdit = (u: AdminUser) => {
    setEditingUserId(u.id);
    setUserStatus(u.status);
    setUserMaxRunning(u.maxRunning);
    setUserMaxQueued(u.maxQueued);
    setUserRateLimit(u.rateLimitPerMin);
  };

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-8 text-13">
      <div>
        <h1 className="text-20 font-semibold text-ink tracking-tight">Admin Console</h1>
        <p className="text-13 text-muted">
          Cluster-wide queue depths, active worker daemons, and tenant limit controls.
        </p>
      </div>

      {/* 1) Queue depths & Redis breakdown */}
      <div className="space-y-3">
        <h2 className="text-14 font-semibold text-ink">Redis Queue Depths & Status Breakdown</h2>
        {queuesError ? (
          <InlineError message="Failed to load queue depths." onRetry={() => refetchQueues()} />
        ) : isQueuesLoading ? (
          <TableSkeleton rows={2} cols={3} />
        ) : queuesData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-panel border border-border rounded p-4 space-y-3">
              <div className="text-12 font-mono text-muted uppercase">Priority Queue Depths (Redis)</div>
              <div className="grid grid-cols-3 gap-3 font-mono">
                <div className="p-3 bg-page border border-border rounded">
                  <div className="text-12 text-muted mb-1">HIGH (0)</div>
                  <div className="text-20 font-semibold text-ink tabular-nums">
                    {queuesData.redisDepth.high}
                  </div>
                </div>
                <div className="p-3 bg-page border border-border rounded">
                  <div className="text-12 text-muted mb-1">NORMAL (1)</div>
                  <div className="text-20 font-semibold text-ink tabular-nums">
                    {queuesData.redisDepth.normal}
                  </div>
                </div>
                <div className="p-3 bg-page border border-border rounded">
                  <div className="text-12 text-muted mb-1">LOW (2)</div>
                  <div className="text-20 font-semibold text-ink tabular-nums">
                    {queuesData.redisDepth.low}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-panel border border-border rounded p-4 space-y-3">
              <div className="text-12 font-mono text-muted uppercase">Total Jobs by Status</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-12">
                {Object.entries(queuesData.jobsByStatus || {}).map(([st, cnt]) => (
                  <div key={st} className="p-2 bg-page border border-border rounded flex justify-between">
                    <span className="text-muted">{st}</span>
                    <span className="font-semibold text-ink tabular-nums">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2) Workers Table with Heartbeat Age > 30s Flagged */}
      <div className="space-y-3">
        <h2 className="text-14 font-semibold text-ink">Worker Daemons</h2>
        {workersError ? (
          <InlineError message="Failed to load worker nodes." onRetry={() => refetchWorkers()} />
        ) : isWorkersLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : !workers || workers.length === 0 ? (
          <div className="p-8 text-center text-muted bg-panel border border-border rounded italic">
            No active worker daemons reported.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Worker ID</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Running Tasks</TableHead>
                <TableHead>Heartbeat Age</TableHead>
                <TableHead className="text-right">Last Heartbeat</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {workers.map((w) => {
                // Heartbeat age flagged when over 30 s
                const isOver30s = w.heartbeatAgeSec > 30;

                return (
                  <TableRow key={w.id} className={isOver30s ? 'bg-status-dead/5' : ''}>
                    <TableCell className="font-mono font-semibold text-ink flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOver30s ? 'bg-status-dead animate-pulse' : 'bg-status-succeeded'
                        }`}
                      />
                      {w.id}
                    </TableCell>
                    <TableCell className="font-mono text-12 text-muted">{w.host}</TableCell>
                    <TableCell className="font-mono text-12 tabular-nums text-ink">
                      {w.runningCount}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-mono text-12 tabular-nums px-2 py-0.5 rounded border ${
                          isOver30s
                            ? 'bg-status-dead/10 border-status-dead/30 text-status-dead font-semibold'
                            : 'bg-page border-border text-muted'
                        }`}
                      >
                        {w.heartbeatAgeSec}s {isOver30s ? '(! stale)' : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <RelativeTime date={w.lastHeartbeatAt} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 3) Users Table with Inline Quota Edit & Enable/Disable */}
      <div className="space-y-3">
        <h2 className="text-14 font-semibold text-ink">Tenant Users & Quota Controls</h2>
        {usersError ? (
          <InlineError message="Failed to load tenant users." onRetry={() => refetchUsers()} />
        ) : isUsersLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : !usersData || usersData.items.length === 0 ? (
          <div className="p-8 text-center text-muted bg-panel border border-border rounded italic">
            No users registered.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Max Running</TableHead>
                <TableHead>Max Queued</TableHead>
                <TableHead>Rate Limit/min</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {usersData.items.map((u) => {
                const isEditing = editingUserId === u.id;

                if (isEditing) {
                  return (
                    <TableRow key={u.id} className="bg-page">
                      <TableCell className="font-semibold text-ink">{u.email}</TableCell>
                      <TableCell className="font-mono text-12 text-muted">{u.role}</TableCell>
                      <TableCell>
                        <select
                          value={userStatus}
                          onChange={(e) => setUserStatus(e.target.value as 'ACTIVE' | 'DISABLED')}
                          className="px-2 py-1 border border-border rounded bg-panel text-12"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="DISABLED">DISABLED</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          type="number"
                          value={userMaxRunning}
                          onChange={(e) => setUserMaxRunning(Number(e.target.value))}
                          className="w-20 px-2 py-1 border border-border rounded bg-panel font-mono text-12"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="number"
                          value={userMaxQueued}
                          onChange={(e) => setUserMaxQueued(Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-border rounded bg-panel font-mono text-12"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="number"
                          value={userRateLimit}
                          onChange={(e) => setUserRateLimit(Number(e.target.value))}
                          className="w-20 px-2 py-1 border border-border rounded bg-panel font-mono text-12"
                        />
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={updateUserMutation.isPending}
                          onClick={() => updateUserMutation.mutate(u.id)}
                        >
                          {updateUserMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingUserId(null)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold text-ink">{u.email}</TableCell>
                    <TableCell className="font-mono text-12 text-muted">{u.role}</TableCell>
                    <TableCell>
                      <span
                        className={`text-12 font-mono font-semibold px-2 py-0.5 rounded border ${
                          u.status === 'ACTIVE'
                            ? 'bg-status-succeeded/10 border-status-succeeded/30 text-status-succeeded'
                            : 'bg-status-dead/10 border-status-dead/30 text-status-dead'
                        }`}
                      >
                        {u.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-12 tabular-nums">{u.maxRunning}</TableCell>
                    <TableCell className="font-mono text-12 tabular-nums">{u.maxQueued}</TableCell>
                    <TableCell className="font-mono text-12 tabular-nums">
                      {u.rateLimitPerMin}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="secondary" size="sm" onClick={() => startInlineEdit(u)}>
                        Edit Quotas
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
