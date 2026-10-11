import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={selectId} className="block text-12 font-semibold text-ink">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full px-3 py-1.5 border rounded bg-panel text-13 transition-colors ${
            error ? 'border-status-dead focus:border-status-dead' : 'border-border focus:border-accent'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-12 text-status-dead font-mono">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
