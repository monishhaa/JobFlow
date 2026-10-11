import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Endpoint } from '../types';
import { TableSkeleton, InlineError } from '../components/UIState';
import { Drawer } from '../components/Drawer';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';

interface HeaderRow {
  name: string;
  value: string;
}

export const EndpointsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('POST');
  const [headers, setHeaders] = useState<HeaderRow[]>([{ name: '', value: '' }]);
  const [formError, setFormError] = useState<string | null>(null);

  // Query endpoints
  const {
    data: endpoints,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Endpoint[]>({
    queryKey: ['endpoints'],
    queryFn: () => apiFetch<Endpoint[]>('/endpoints'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const headersMap: Record<string, string> = {};
      headers.forEach((h) => {
        const k = h.name.trim();
        if (k) {
          headersMap[k] = h.value;
        }
      });

      return apiFetch('/endpoints', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          method,
          headers: Object.keys(headersMap).length > 0 ? headersMap : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      handleCloseDrawer();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to register endpoint');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/endpoints/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setConfirmDeleteId(null);
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to delete endpoint');
      setConfirmDeleteId(null);
    },
  });

  const handleOpenNew = () => {
    setName('');
    setUrl('');
    setMethod('POST');
    setHeaders([{ name: '', value: '' }]);
    setFormError(null);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setFormError(null);
  };

  const handleAddHeaderRow = () => {
    setHeaders([...headers, { name: '', value: '' }]);
  };

  const handleRemoveHeaderRow = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleHeaderChange = (index: number, field: 'name' | 'value', value: string) => {
    const updated = [...headers];
    updated[index][field] = value;
    setHeaders(updated);
  };

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-20 font-semibold text-ink tracking-tight">Endpoints</h1>
          <p className="text-13 text-muted">
            Register external HTTP webhooks that can be dispatched by <code className="font-mono text-12">CALL_ENDPOINT</code> jobs.
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenNew}>
          New endpoint
        </Button>
      </div>

      {/* Table or Empty State */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : isError ? (
        <InlineError
          message={error instanceof Error ? error.message : 'Error fetching endpoints'}
          onRetry={() => refetch()}
        />
      ) : !endpoints || endpoints.length === 0 ? (
        <div className="py-12 px-6 text-center border border-dashed border-border rounded bg-panel space-y-3">
          <p className="text-14 font-semibold text-ink">
            No endpoints yet. Register a web address your jobs should call.
          </p>
          <p className="text-13 text-muted font-mono">
            Example: name <span className="text-ink">send-welcome-email</span>, POST{' '}
            <span className="text-ink">https://myapp.com/api/jobs/welcome</span>
          </p>
          <div className="pt-2">
            <Button variant="secondary" onClick={handleOpenNew}>
              Register an endpoint
            </Button>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Name</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Headers</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {endpoints.map((ep) => {
              const headerKeys = ep.headers ? Object.keys(ep.headers) : [];
              return (
                <TableRow key={ep.id}>
                  <TableCell className="font-mono text-13 font-semibold text-ink">
                    {ep.name}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-12 font-semibold px-2 py-0.5 rounded bg-page border border-border text-ink">
                      {ep.method}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-12 text-ink max-w-md truncate" title={ep.url}>
                    {ep.url}
                  </TableCell>
                  <TableCell className="font-mono text-12 text-muted">
                    {headerKeys.length > 0 ? (
                      <span title={headerKeys.join(', ')}>
                        {headerKeys.join(', ')}
                      </span>
                    ) : (
                      <span className="italic text-muted/60">none</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {confirmDeleteId === ep.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-12 text-status-dead font-semibold">Delete?</span>
                        <button
                          onClick={() => deleteMutation.mutate(ep.id)}
                          disabled={deleteMutation.isPending}
                          className="text-12 font-semibold text-status-dead hover:underline"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-12 text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(ep.id)}
                        className="text-12 font-medium text-status-dead hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* New Endpoint Drawer */}
      {isDrawerOpen && (
        <Drawer isOpen={true} onClose={handleCloseDrawer} title="New Endpoint">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFormError(null);
              createMutation.mutate();
            }}
            className="space-y-4 text-13"
          >
            {formError && (
              <div className="p-3 bg-status-dead/10 border border-status-dead/20 text-status-dead rounded text-12 font-mono">
                {formError}
              </div>
            )}

            <Input
              label="Endpoint Name *"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. send-welcome-email"
              className="font-mono text-13"
            />
            <p className="text-12 text-muted -mt-2">
              Must start with a letter/digit and contain only lowercase letters, digits, underscores, or dashes (max 40 chars).
            </p>

            <Input
              label="URL *"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://myapp.com/api/jobs/welcome"
              className="font-mono text-12"
            />

            <Select
              label="HTTP Method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="GET">GET</option>
              <option value="DELETE">DELETE</option>
            </Select>

            {/* Repeatable Headers */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-12 font-semibold text-ink">Custom Headers</label>
                <button
                  type="button"
                  onClick={handleAddHeaderRow}
                  className="text-12 text-accent hover:underline font-medium"
                >
                  + Add header
                </button>
              </div>

              <div className="space-y-2">
                {headers.map((hdr, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Header name (e.g. Authorization)"
                      value={hdr.name}
                      onChange={(e) => handleHeaderChange(idx, 'name', e.target.value)}
                      className="w-1/2 px-3 py-1.5 border border-border rounded bg-panel font-mono text-12 focus:border-accent"
                    />
                    <input
                      type="password"
                      placeholder="Value"
                      value={hdr.value}
                      onChange={(e) => handleHeaderChange(idx, 'value', e.target.value)}
                      className="w-1/2 px-3 py-1.5 border border-border rounded bg-panel font-mono text-12 focus:border-accent"
                    />
                    {headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveHeaderRow(idx)}
                        className="text-muted hover:text-status-dead text-14 px-1"
                        title="Remove header"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-12 text-muted">
                Values are stored encrypted and never shown again.
              </p>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleCloseDrawer}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Registering...' : 'Register Endpoint'}
              </Button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
};
