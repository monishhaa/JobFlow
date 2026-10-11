import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-12 font-semibold text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-1.5 border rounded bg-panel text-13 placeholder:text-muted/60 transition-colors ${
            error ? 'border-status-dead focus:border-status-dead' : 'border-border focus:border-accent'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-12 text-status-dead font-mono">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
