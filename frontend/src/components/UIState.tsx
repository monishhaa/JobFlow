import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`animate-pulse bg-border/60 rounded ${className}`} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 5 }) => (
  <div className="w-full divide-y divide-border">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="py-3 px-4 flex items-center justify-between gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton
            key={c}
            className={`h-4 ${c === 0 ? 'w-24' : c === 1 ? 'w-36' : 'w-16'}`}
          />
        ))}
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title?: string;
  message: string;
  action?: React.ReactNode;
}> = ({ title, message, action }) => (
  <div className="py-12 px-4 text-center border border-dashed border-border rounded bg-panel">
    {title && <p className="text-14 font-semibold text-ink mb-1">{title}</p>}
    <p className="text-13 text-muted">{message}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const InlineError: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'An unexpected error occurred while loading this data.',
  onRetry,
}) => (
  <div className="p-4 border border-status-dead/30 bg-status-dead/5 rounded text-13 text-status-dead flex items-center justify-between">
    <span>{message}</span>
    {onRetry && (
      <button
        onClick={onRetry}
        className="underline font-semibold text-status-dead hover:opacity-80"
      >
        Retry
      </button>
    )}
  </div>
);
