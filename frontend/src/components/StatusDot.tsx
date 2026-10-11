import React from 'react';
import { JobStatus } from '../types';

export interface StatusDotProps {
  status: JobStatus | 'ACTIVE' | 'DISABLED';
  attempts?: number;
  className?: string;
  showLabel?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  attempts = 0,
  className = '',
  showLabel = true,
}) => {
  const isRetrying = status === 'QUEUED' && attempts > 0;

  let dotColor = '#8A8A84'; // queued
  let label = 'Queued';

  if (isRetrying) {
    dotColor = '#A5812F';
    label = `Retrying (${attempts})`;
  } else {
    switch (status) {
      case 'SUCCEEDED':
      case 'ACTIVE':
        dotColor = '#3F7D5B';
        label = status === 'ACTIVE' ? 'Active' : 'Succeeded';
        break;
      case 'RUNNING':
        dotColor = '#3B6EA8';
        label = 'Running';
        break;
      case 'DEAD':
      case 'DISABLED':
        dotColor = '#B0483F';
        label = status === 'DISABLED' ? 'Disabled' : 'Dead';
        break;
      case 'CANCELLED':
        dotColor = '#8A8A84';
        label = 'Cancelled';
        break;
      case 'QUEUED':
      default:
        dotColor = '#8A8A84';
        label = 'Queued';
        break;
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-12 font-medium ${className}`}>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      {showLabel && <span className="text-ink">{label}</span>}
    </span>
  );
};
