import React from 'react';
import { formatRelativeTime, formatExactLocalTime } from '../lib/utils';

export interface RelativeTimeProps {
  date?: string | null;
  className?: string;
}

export const RelativeTime: React.FC<RelativeTimeProps> = ({ date, className = '' }) => {
  if (!date) return <span className={`text-muted ${className}`}>—</span>;

  return (
    <span
      className={`text-12 text-muted cursor-default ${className}`}
      title={formatExactLocalTime(date)}
    >
      {formatRelativeTime(date)}
    </span>
  );
};
