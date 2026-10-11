import React from 'react';
import { JobStatus } from '../types';

interface StatusBadgeProps {
  status: JobStatus;
  attempts?: number;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, attempts = 0, className = '' }) => {
  // "Retrying" is QUEUED with attempts > 0
  const isRetrying = status === 'QUEUED' && attempts > 0;

  let dotColor = '#8A8A84'; // queued
  let label = 'Queued';

  if (isRetrying) {
    dotColor = '#A5812F'; // retrying
    label = `Retrying (${attempts})`;
  } else {
    switch (status) {
      case 'SUCCEEDED':
        dotColor = '#3F7D5B';
        label = 'Succeeded';
        break;
      case 'RUNNING':
        dotColor = '#3B6EA8';
        label = 'Running';
        break;
      case 'DEAD':
        dotColor = '#B0483F';
        label = 'Dead';
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
      <span className="text-ink">{label}</span>
    </span>
  );
};
