/**
 * Formats an ISO UTC date string into a relative time string (e.g. "2 min ago", "just now")
 */
export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return '—';
  
  const date = new Date(isoString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffInSeconds)) return '—';
  if (diffInSeconds < 5 && diffInSeconds >= -5) return 'just now';

  if (diffInSeconds < 0) {
    // In the future (e.g. nextRunAt)
    const futureSec = Math.abs(diffInSeconds);
    if (futureSec < 60) return `in ${futureSec}s`;
    if (futureSec < 3600) return `in ${Math.floor(futureSec / 60)}m`;
    if (futureSec < 86400) return `in ${Math.floor(futureSec / 3600)}h`;
    return `in ${Math.floor(futureSec / 86400)}d`;
  }

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
}

/**
 * Formats an ISO UTC date string into a precise local date/time string for tooltips
 */
export function formatExactLocalTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  } catch {
    return isoString;
  }
}

/**
 * Formats duration in milliseconds into a readable human format
 */
export function formatDuration(durationMs?: number | null): string {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs)) return '—';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(2)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = ((durationMs % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Priority number to text
 * priority: 0 high, 1 normal, 2 low
 */
export function formatPriority(priority: number): { label: string; textClass: string } {
  switch (priority) {
    case 0:
      return { label: 'HIGH', textClass: 'text-ink font-semibold' };
    case 1:
      return { label: 'NORMAL', textClass: 'text-muted' };
    case 2:
      return { label: 'LOW', textClass: 'text-muted/70' };
    default:
      return { label: 'NORMAL', textClass: 'text-muted' };
  }
}
