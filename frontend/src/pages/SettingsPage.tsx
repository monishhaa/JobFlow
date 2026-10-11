import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { InlineError, Skeleton } from '../components/UIState';

export const SettingsPage: React.FC = () => {
  const { me, refreshMe } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Webhook secret masked state
  const [showSecret, setShowSecret] = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);

  // Change Password Mutation
  const passwordMutation = useMutation({
    mutationFn: () =>
      apiFetch('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordError(null);
    },
    onError: (err: unknown) => {
      setPasswordSuccess(false);
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    },
  });

  // Rotate Webhook Secret Mutation
  const rotateSecretMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ webhookSecret: string }>('/me/webhook-secret/rotate', {
        method: 'POST',
      }),
    onSuccess: () => {
      refreshMe();
      setRotatingSecret(false);
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Failed to rotate secret');
      setRotatingSecret(false);
    },
  });

  const rawSecret = me?.webhookSecret || '';
  const maskedSecret = rawSecret ? `${rawSecret.substring(0, 6)}${'•'.repeat(24)}` : '—';

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-8 text-13">
      <div>
        <h1 className="text-20 font-semibold text-ink tracking-tight">Settings</h1>
        <p className="text-13 text-muted">Manage your tenant quotas, signing secret, and security credentials.</p>
      </div>

      {/* Quotas and Usage */}
      <div className="bg-panel border border-border rounded p-5 space-y-4">
        <h2 className="text-14 font-semibold text-ink">Quotas and Current Usage</h2>
        {!me ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="p-3.5 bg-page border border-border rounded">
              <div className="text-12 text-muted mb-1 uppercase">Running Concurrency</div>
              <div className="text-20 font-semibold text-ink tabular-nums">
                {me.usage.running} / {me.quotas.maxRunning}
              </div>
              <div className="text-12 text-muted mt-1">max parallel workers</div>
            </div>

            <div className="p-3.5 bg-page border border-border rounded">
              <div className="text-12 text-muted mb-1 uppercase">Queued Backlog</div>
              <div className="text-20 font-semibold text-ink tabular-nums">
                {me.usage.queued} / {me.quotas.maxQueued}
              </div>
              <div className="text-12 text-muted mt-1">max queued tasks</div>
            </div>

            <div className="p-3.5 bg-page border border-border rounded">
              <div className="text-12 text-muted mb-1 uppercase">Rate Limit</div>
              <div className="text-20 font-semibold text-ink tabular-nums">
                {me.usage.requestsThisMinute} / {me.quotas.rateLimitPerMin}
              </div>
              <div className="text-12 text-muted mt-1">requests / minute</div>
            </div>
          </div>
        )}
      </div>

      {/* Webhook Secret Masked with Rotate */}
      <div className="bg-panel border border-border rounded p-5 space-y-4">
        <div>
          <h2 className="text-14 font-semibold text-ink">Webhook Signing Secret</h2>
          <p className="text-12 text-muted">
            Used to sign payload notifications sent to your job callback URLs via HMAC.
          </p>
        </div>

        <div className="space-y-3 max-w-xl">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={showSecret ? rawSecret : maskedSecret}
              className="flex-1 px-3 py-1.5 border border-border rounded bg-page font-mono text-12 text-ink select-all focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? 'Hide' : 'Reveal'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={rotatingSecret || rotateSecretMutation.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Rotate your webhook signing secret? Existing webhook endpoints will need the new secret.'
                  )
                ) {
                  setRotatingSecret(true);
                  rotateSecretMutation.mutate();
                }
              }}
            >
              {rotateSecretMutation.isPending ? 'Rotating...' : 'Rotate'}
            </Button>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-panel border border-border rounded p-5 space-y-4">
        <h2 className="text-14 font-semibold text-ink">Change Password</h2>

        {passwordSuccess && (
          <div className="p-3 bg-status-succeeded/10 border border-status-succeeded/20 text-status-succeeded rounded text-12 font-mono">
            Password updated successfully.
          </div>
        )}
        {passwordError && (
          <div className="p-3 bg-status-dead/10 border border-status-dead/20 text-status-dead rounded text-12 font-mono">
            {passwordError}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPasswordError(null);
            setPasswordSuccess(false);
            if (newPassword.length < 8 || newPassword.length > 72) {
              setPasswordError('New password must be between 8 and 72 characters');
              return;
            }
            passwordMutation.mutate();
          }}
          className="space-y-3 max-w-md"
        >
          <Input
            label="Current Password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <Input
            label="New Password (8-72 characters)"
            type="password"
            required
            minLength={8}
            maxLength={72}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <Button type="submit" variant="primary" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending ? 'Updating...' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  );
};
