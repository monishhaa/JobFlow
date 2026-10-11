import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useSse } from '../context/SseContext';
import { apiFetch } from '../lib/api';
import { StatsSummary } from '../types';
import { NewJobModal } from './NewJobModal';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const { status: sseStatus } = useSse();
  const navigate = useNavigate();
  const location = useLocation();
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);

  // Read stats summary with 15s refetch interval (also invalidated on SSE events)
  const { data: stats } = useQuery<StatsSummary>({
    queryKey: ['stats', 'summary'],
    queryFn: () => apiFetch<StatsSummary>('/stats/summary'),
    refetchInterval: 15000,
  });

  const usage = stats?.usage;

  // Global keyboard shortcuts: 'n' for new job, '/' for search, 'Esc' to close drawers/modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute('contenteditable') === 'true';

      if (e.key === 'Escape') {
        setIsNewJobOpen(false);
        return;
      }

      if (isInput) return;

      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsNewJobOpen(true);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
          searchInput.focus();
        } else {
          navigate('/jobs');
          setTimeout(() => {
            document.getElementById('global-search-input')?.focus();
          }, 50);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const navItems = [
    { to: '/', label: 'Dashboard', exact: true },
    { to: '/jobs', label: 'Jobs' },
    { to: '/schedules', label: 'Schedules' },
    { to: '/endpoints', label: 'Endpoints' },
    { to: '/keys', label: 'API keys' },
    { to: '/settings', label: 'Settings' },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({ to: '/admin', label: 'Admin' });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-page text-ink font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border bg-panel flex flex-col md:min-h-screen shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-accent rounded-sm inline-block"></span>
            <span className="font-semibold text-14 tracking-tight">Jobflow</span>
          </div>
          <button
            onClick={() => setIsNewJobOpen(true)}
            className="md:hidden bg-accent hover:bg-accent-hover text-white text-12 font-medium px-2.5 py-1 rounded"
          >
            + New
          </button>
        </div>

        <nav className="p-3 flex md:flex-col gap-1 overflow-x-auto flex-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`px-3 py-1.5 rounded text-13 font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-ink hover:bg-page'
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Quotas / Usage summary widget in sidebar for desktop */}
        {usage && (
          <div className="hidden md:block p-3 border-t border-border text-12">
            <div className="text-muted font-mono mb-2 flex justify-between">
              <span>RATE LIMIT</span>
              <span className="tabular-nums font-semibold text-ink">
                {usage.requestsThisMinute}/{usage.rateLimitPerMin}/m
              </span>
            </div>
            <div className="text-muted font-mono flex justify-between">
              <span>RUNNING</span>
              <span className="tabular-nums font-semibold text-ink">
                {usage.running}/{usage.maxRunning}
              </span>
            </div>
          </div>
        )}

        <div className="hidden md:flex p-3 border-t border-border flex-col gap-2">
          <button
            onClick={() => setIsNewJobOpen(true)}
            className="w-full bg-accent hover:bg-accent-hover text-white text-13 font-semibold py-1.5 px-3 rounded flex items-center justify-between"
          >
            <span>New Job</span>
            <span className="text-12 opacity-80 font-mono">n</span>
          </button>

          {/* SSE Live status indicator in sidebar footer */}
          <div className="flex items-center justify-between text-12 pt-1">
            <div className="flex items-center gap-1.5 text-muted font-mono text-12">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sseStatus === 'connected'
                    ? 'bg-status-succeeded'
                    : sseStatus === 'reconnecting'
                    ? 'bg-status-retrying animate-pulse'
                    : 'bg-muted'
                }`}
              />
              <span>
                {sseStatus === 'connected'
                  ? 'Live'
                  : sseStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Offline'}
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="text-muted hover:text-ink underline text-12"
            >
              Log out
            </button>
          </div>

          <div className="flex items-center justify-between text-12 pt-1 border-t border-border/50">
            <NavLink
              to="/how-it-works"
              className="text-muted hover:text-ink hover:underline text-12 font-medium"
            >
              How it works
            </NavLink>
          </div>

          <div className="truncate text-12 text-muted" title={user?.email}>
            {user?.email}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        <Outlet />
      </main>

      {/* New Job Modal */}
      {isNewJobOpen && <NewJobModal onClose={() => setIsNewJobOpen(false)} />}
    </div>
  );
};
