import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch, CustomApiError } from '../lib/api';
import { Drawer } from './Drawer';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { Endpoint } from '../types';

interface NewJobModalProps {
  onClose: () => void;
  defaultJobType?: string;
  defaultPayload?: string;
}

interface JobTypeMeta {
  description: string;
  example: string;
  fieldNotes: string;
}

const TYPE_CONFIG: Record<string, JobTypeMeta> = {
  CALL_ENDPOINT: {
    description: 'Calls the endpoint you registered, with your data, retrying on failure.',
    example: '{\n  "name": "Jane Doe",\n  "plan": "pro"\n}',
    fieldNotes: 'endpoint: registered target endpoint; data: JSON object forwarded in request payload.',
  },
  HTTP_CALL: {
    description: 'Calls a web address for you, now or later.',
    example: '{\n  "url": "https://httpbin.org/post",\n  "method": "POST",\n  "body": "{\\"hello\\":\\"world\\"}"\n}',
    fieldNotes: 'url: destination web address; method: GET/POST/etc; body: optional request body.',
  },
  SEND_EMAIL: {
    description: 'Simulated email. Records that a message would be sent.',
    example: '{\n  "to": "user@example.com",\n  "subject": "Welcome to Jobflow",\n  "body": "Thanks for joining us!"\n}',
    fieldNotes: 'to: recipient email address; subject: message subject; body: plain text body.',
  },
  GENERATE_REPORT: {
    description: 'Creates a sample CSV report.',
    example: '{\n  "rows": 1000,\n  "durationSec": 2,\n  "format": "csv"\n}',
    fieldNotes: 'rows: row count (1-1,000,000); durationSec: synthetic delay; format: csv.',
  },
  DEMO_FLAKY: {
    description: 'A practice job: waits durationSec seconds, then fails randomly at the failRate you set (0 never, 1 always).',
    example: '{\n  "durationSec": 2,\n  "failRate": 0.5\n}',
    fieldNotes: 'durationSec: seconds to pause; failRate: 0.0 (never fail) to 1.0 (always fail).',
  },
};

export const NewJobModal: React.FC<NewJobModalProps> = ({
  onClose,
  defaultJobType = 'DEMO_FLAKY',
  defaultPayload,
}) => {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(defaultJobType);
  const [endpointName, setEndpointName] = useState<string>('');
  const [payload, setPayload] = useState<string>(() => {
    if (defaultPayload) return defaultPayload;
    return TYPE_CONFIG[defaultJobType]?.example || '{\n  \n}';
  });
  const [priority, setPriority] = useState<'HIGH' | 'NORMAL' | 'LOW'>('NORMAL');
  const [runAt, setRunAt] = useState('');
  const [maxAttempts, setMaxAttempts] = useState<number>(3);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(60);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [jsonError, setJsonError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Fetch existing job types
  const { data: serverJobTypes } = useQuery<string[]>({
    queryKey: ['jobTypes'],
    queryFn: () => apiFetch<string[]>('/jobs/types'),
  });

  // Fetch user registered endpoints for CALL_ENDPOINT
  const { data: endpoints } = useQuery<Endpoint[]>({
    queryKey: ['endpoints'],
    queryFn: () => apiFetch<Endpoint[]>('/endpoints'),
  });

  // Ensure known types are available in dropdown even if backend hasn't loaded yet
  const availableTypes = React.useMemo(() => {
    const list = ['CALL_ENDPOINT', 'HTTP_CALL', 'SEND_EMAIL', 'GENERATE_REPORT', 'DEMO_FLAKY'];
    if (serverJobTypes) {
      serverJobTypes.forEach((t) => {
        if (!list.includes(t)) list.push(t);
      });
    }
    return list;
  }, [serverJobTypes]);

  // Set default endpoint if available
  React.useEffect(() => {
    if (type === 'CALL_ENDPOINT' && endpoints && endpoints.length > 0 && !endpointName) {
      setEndpointName(endpoints[0].name);
    }
  }, [type, endpoints, endpointName]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    const config = TYPE_CONFIG[newType];
    if (config) {
      setPayload(config.example);
      setJsonError(null);
    }
  };

  const handlePayloadChange = (val: string) => {
    setPayload(val);
    if (!val.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload: Record<string, unknown> = {};
      if (payload.trim()) {
        try {
          parsedPayload = JSON.parse(payload);
        } catch {
          throw new Error('Payload contains invalid JSON');
        }
      }

      // For CALL_ENDPOINT: send payload as {"endpoint": name, "data": parsed JSON}
      let finalPayload: Record<string, unknown> = parsedPayload;
      if (type === 'CALL_ENDPOINT') {
        if (!endpointName) {
          throw new Error('Please select an endpoint for CALL_ENDPOINT jobs');
        }
        finalPayload = {
          endpoint: endpointName,
          data: parsedPayload,
        };
      }

      const body: Record<string, unknown> = {
        type: type.trim(),
        payload: finalPayload,
        priority,
        maxAttempts: Number(maxAttempts),
        timeoutSeconds: Number(timeoutSeconds),
      };

      if (runAt) {
        body.runAt = new Date(runAt).toISOString();
      }
      if (callbackUrl.trim()) {
        body.callbackUrl = callbackUrl.trim();
      }

      const headers: Record<string, string> = {};
      if (idempotencyKey.trim()) {
        headers['Idempotency-Key'] = idempotencyKey.trim();
      }

      return apiFetch('/jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['jobTypes'] });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof CustomApiError) {
        if (err.status === 429) {
          const waitSec = err.retryAfter ?? 60;
          setApiError(`Rate/queue limit exceeded (429). Retry after ${waitSec}s.`);
        } else if (err.status === 422) {
          setApiError('Conflict (422): Same idempotency key used with a different request payload.');
        } else if (err.status === 400) {
          setApiError(`Validation error (400): ${err.message}`);
        } else {
          setApiError(err.message || 'Failed to dispatch job');
        }
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('An unexpected error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!type.trim()) {
      setApiError('Job type is required');
      return;
    }

    if (type === 'CALL_ENDPOINT' && !endpointName) {
      setApiError('You must select or register an endpoint first');
      return;
    }

    if (jsonError) {
      setApiError('Please fix payload JSON syntax errors before submitting.');
      return;
    }

    createMutation.mutate();
  };

  const typeConfig = TYPE_CONFIG[type];

  return (
    <Drawer isOpen={true} onClose={onClose} title="Dispatch New Job">
      <form onSubmit={handleSubmit} className="space-y-4 text-13">
        {apiError && (
          <div className="p-3 bg-status-dead/10 border border-status-dead/20 text-status-dead rounded text-12 font-mono">
            {apiError}
          </div>
        )}

        <div>
          <label className="block text-12 font-semibold text-ink mb-1">
            Job Type *
          </label>
          <Select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'CALL_ENDPOINT' ? 'CALL_ENDPOINT (Call my endpoint)' : t}
              </option>
            ))}
          </Select>
          {typeConfig && (
            <p className="text-12 text-muted mt-1.5 leading-relaxed">
              {typeConfig.description}
            </p>
          )}
        </div>

        {/* CALL_ENDPOINT specific endpoint selector */}
        {type === 'CALL_ENDPOINT' && (
          <div className="space-y-1 p-3 bg-page border border-border rounded">
            <div className="flex items-center justify-between">
              <label className="text-12 font-semibold text-ink">
                Select Target Endpoint *
              </label>
              {(!endpoints || endpoints.length === 0) && (
                <Link
                  to="/endpoints"
                  onClick={onClose}
                  className="text-12 text-accent font-medium hover:underline"
                >
                  Register an endpoint
                </Link>
              )}
            </div>
            {endpoints && endpoints.length > 0 ? (
              <Select
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
              >
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.name}>
                    {ep.name} ({ep.method} {ep.url})
                  </option>
                ))}
              </Select>
            ) : (
              <div className="text-12 text-muted py-1">
                No endpoints registered yet.{' '}
                <Link
                  to="/endpoints"
                  onClick={onClose}
                  className="text-accent underline"
                >
                  Register an endpoint
                </Link>{' '}
                to use this job type.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-12 font-semibold text-ink">
              {type === 'CALL_ENDPOINT' ? 'Data (JSON)' : 'Payload (JSON)'}
            </label>
            {typeConfig && (
              <button
                type="button"
                onClick={() => {
                  setPayload(typeConfig.example);
                  setJsonError(null);
                }}
                className="text-12 text-accent hover:underline"
              >
                Reset to example
              </button>
            )}
          </div>
          <textarea
            rows={5}
            value={payload}
            onChange={(e) => handlePayloadChange(e.target.value)}
            className={`w-full px-3 py-1.5 border rounded bg-panel font-mono text-12 transition-colors ${
              jsonError ? 'border-status-dead focus:border-status-dead' : 'border-border focus:border-accent'
            }`}
          />
          {jsonError ? (
            <p className="text-12 text-status-dead font-mono mt-1">
              Invalid JSON: {jsonError}
            </p>
          ) : (
            typeConfig?.fieldNotes && (
              <p className="text-12 text-muted mt-1 font-mono">
                {typeConfig.fieldNotes}
              </p>
            )
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'HIGH' | 'NORMAL' | 'LOW')}
          >
            <option value="HIGH">High (0)</option>
            <option value="NORMAL">Normal (1)</option>
            <option value="LOW">Low (2)</option>
          </Select>

          <Input
            label="Max Attempts (1-10)"
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Timeout (seconds)"
            type="number"
            min={1}
            max={3600}
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
          />

          <Input
            label="Schedule Run At (optional)"
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
          />
        </div>

        <Input
          label="Callback URL (optional)"
          type="url"
          value={callbackUrl}
          onChange={(e) => setCallbackUrl(e.target.value)}
          placeholder="https://api.domain.com/webhooks/job-complete"
          className="font-mono text-12"
        />

        <Input
          label="Idempotency-Key (optional)"
          type="text"
          value={idempotencyKey}
          onChange={(e) => setIdempotencyKey(e.target.value)}
          placeholder="Unique request idempotency key"
          className="font-mono text-12"
        />

        <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={createMutation.isPending || !!jsonError}
          >
            {createMutation.isPending ? 'Submitting...' : 'Dispatch Job'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
};
