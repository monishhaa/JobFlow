import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch, CustomApiError } from '../lib/api';
import { AuthResponse } from '../types';
import { RecoveryTimeline } from '../components/RecoveryTimeline';

export const AuthPage: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleToggleMode = (register: boolean) => {
    setIsRegister(register);
    setFieldErrors({});
    setGeneralError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    // Client-side field validations
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Email address is required';
    }
    if (password.length < 8 || password.length > 72) {
      errors.password = 'Password must be between 8 and 72 characters';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.email) {
        emailRef.current?.focus();
      } else if (errors.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const data = await apiFetch<AuthResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
        retryOn401: false,
      });

      login(data.accessToken, data.user);
      navigate('/');
    } catch (err: unknown) {
      if (err instanceof CustomApiError) {
        const msg = err.message || 'Authentication failed';
        const lower = msg.toLowerCase();
        if (lower.includes('email') || lower.includes('user') || lower.includes('account')) {
          setFieldErrors({ email: msg });
          emailRef.current?.focus();
        } else if (lower.includes('password')) {
          setFieldErrors({ password: msg });
          passwordRef.current?.focus();
        } else {
          setGeneralError(msg);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-page grid grid-cols-1 lg:grid-cols-[55%_45%] font-sans text-ink">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex bg-[#1C1C1A] text-[#FAF9F6] p-12 flex-col justify-between min-h-screen">
        {/* Top: Square wordmark + Jobflow */}
        <div className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 bg-accent rounded-sm inline-block" />
          <span className="font-semibold text-14 tracking-tight text-[#FAF9F6]">Jobflow</span>
        </div>

        {/* Middle: Headline, description, and timeline */}
        <div className="space-y-8 my-auto py-12 max-w-xl">
          <div className="space-y-4">
            <h1 className="animate-fade-up-1 text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] max-w-[14ch] text-[#FAF9F6]">
              Submit work. Watch it run. Recover when it fails.
            </h1>
            <p className="animate-fade-up-2 text-[#9A9892] text-[15px] max-w-[42ch] leading-relaxed">
              A background job platform with leases, retries and per-user isolation.
            </p>
          </div>

          <div className="animate-fade-up-3 pt-2">
            <RecoveryTimeline />
          </div>
        </div>

        {/* Bottom: Facts line in mono */}
        <div className="animate-fade-up-4 flex items-center gap-4 text-12 font-mono text-[#9A9892]">
          <span>at-least-once delivery</span>
          <span className="w-px h-3 bg-[#383734]" />
          <span>leases + fencing</span>
          <span className="w-px h-3 bg-[#383734]" />
          <span>per-user isolation</span>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex items-center justify-center p-6 sm:p-12 min-h-screen bg-page">
        <div className="w-full max-w-[360px] space-y-6">
          {/* Top mode switch */}
          <div className="flex items-center gap-4 border-b border-border pb-2 text-13 font-medium">
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              className={`pb-1 transition-colors relative ${
                !isRegister ? 'text-ink font-semibold' : 'text-muted hover:text-ink'
              }`}
            >
              Sign in
              {!isRegister && (
                <span className="absolute bottom-[-9px] left-0 right-0 h-[2px] bg-accent" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode(true)}
              className={`pb-1 transition-colors relative ${
                isRegister ? 'text-ink font-semibold' : 'text-muted hover:text-ink'
              }`}
            >
              Create account
              {isRegister && (
                <span className="absolute bottom-[-9px] left-0 right-0 h-[2px] bg-accent" />
              )}
            </button>
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h2 className="text-28 font-semibold text-ink tracking-tight">
              {isRegister ? 'Create your account' : 'Sign in'}
            </h2>
            <p className="text-14 text-muted">
              {isRegister
                ? 'Get started orchestrating background jobs'
                : 'Enter your credentials to access your cluster'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-13">
            {/* Email field */}
            <div className="space-y-1">
              <label htmlFor="auth-email" className="block text-12 font-semibold text-ink">
                Email
              </label>
              <input
                id="auth-email"
                ref={emailRef}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="developer@domain.com"
                className={`w-full h-10 px-3 border rounded bg-panel font-mono text-13 transition-colors ${
                  fieldErrors.email
                    ? 'border-status-dead focus:border-status-dead'
                    : 'border-border focus:border-accent'
                }`}
              />
              {fieldErrors.email && (
                <p className="text-13 text-status-dead font-mono" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className="space-y-1">
              <label htmlFor="auth-password" className="block text-12 font-semibold text-ink">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  className={`w-full h-10 pl-3 pr-16 border rounded bg-panel text-13 transition-colors ${
                    fieldErrors.password
                      ? 'border-status-dead focus:border-status-dead'
                      : 'border-border focus:border-accent'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-12 text-muted hover:text-ink font-medium px-1.5 py-0.5 rounded"
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {isRegister && !fieldErrors.password && (
                <p className="text-12 text-muted">At least 8 characters</p>
              )}
              {fieldErrors.password && (
                <p className="text-13 text-status-dead font-mono" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* General error message */}
            {generalError && (
              <p
                className="text-13 text-status-dead font-mono"
                role="alert"
                aria-live="polite"
              >
                {generalError}
              </p>
            )}

            {/* Submit button with sliding arrow */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-accent hover:bg-accent-hover text-white font-semibold text-13 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 group"
            >
              <span>
                {loading
                  ? 'Signing in...'
                  : isRegister
                  ? 'Create account'
                  : 'Sign in'}
              </span>
              {!loading && (
                <span
                  aria-hidden="true"
                  className="text-14 transition-transform duration-150 ease-out group-hover:translate-x-[2px]"
                >
                  →
                </span>
              )}
            </button>
          </form>

          {/* Footer note */}
          <p className="text-13 text-muted text-center pt-2">
            Jobs are at-least-once. Handlers should be idempotent.
          </p>
        </div>
      </div>
    </div>
  );
};
