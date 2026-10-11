import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { ApiKey } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/Table';
import { RelativeTime } from '../components/RelativeTime';
import { TableSkeleton, InlineError } from '../components/UIState';

export const ApiKeysPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const {
    data: apiKeys,
    isLoading,
    error,
    refetch,
  } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch<ApiKey[]>('/keys'),
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<ApiKey>('/keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewKeyName('');
      setKeyError(null);
      queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (err: unknown) => {
      setKeyError(err instanceof Error ? err.message : 'Failed to generate API key');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to revoke key');
    },
  });

  return (
    <div className="p-6 max-w-5xl w-full mx-auto space-y-6 text-13">
      <div>
        <h1 className="text-20 font-semibold text-ink tracking-tight">API Access Keys</h1>
        <p className="text-13 text-muted">
          Manage API keys for server-to-server automated job submission.
        </p>
      </div>

      {/* Raw key shown ONCE in a copyable block */}
      {createdKey?.key && (
        <div className="p-4 bg-status-succeeded/10 border border-status-succeeded/30 rounded text-12 font-mono space-y-2">
          <div className="font-semibold text-status-succeeded">
            API key created — copy it now. You won't see this again!
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={createdKey.key}
              className="flex-1 px-3 py-1.5 border border-border rounded bg-panel font-mono text-12 text-ink select-all focus:outline-none"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdKey.key!);
                alert('Copied raw API key to clipboard');
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* Creation form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newKeyName.trim()) {
            createKeyMutation.mutate(newKeyName.trim());
          }
        }}
        className="flex items-end gap-2 bg-panel p-4 border border-border rounded"
      >
        <div className="flex-1">
          <Input
            label="Generate New API Key"
            placeholder="Key name (e.g. CI Dispatcher, Prod Ingest)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={createKeyMutation.isPending || !newKeyName.trim()}
        >
          {createKeyMutation.isPending ? 'Generating...' : 'Generate key'}
        </Button>
      </form>

      {keyError && <InlineError message={keyError} />}

      {/* List with prefix and last used */}
      {isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : error ? (
        <InlineError message="Failed to load API keys" onRetry={() => refetch()} />
      ) : !apiKeys || apiKeys.length === 0 ? (
        <div className="p-8 text-center text-muted bg-panel border border-border rounded italic">
          No API keys created yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Key Name</TableHead>
              <TableHead>Key Prefix / ID</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {apiKeys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-semibold text-ink">{k.name}</TableCell>
                <TableCell className="font-mono text-12 text-muted">
                  {k.id.substring(0, 8)}...
                </TableCell>
                <TableCell>
                  <RelativeTime date={k.createdAt} />
                </TableCell>
                <TableCell>
                  {k.lastUsedAt ? <RelativeTime date={k.lastUsedAt} /> : <span className="text-muted text-12">never</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deleteKeyMutation.isPending}
                    onClick={() => {
                      if (confirm(`Revoke API key "${k.name}"? Any active requests with this key will be rejected.`)) {
                        deleteKeyMutation.mutate(k.id);
                      }
                    }}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
