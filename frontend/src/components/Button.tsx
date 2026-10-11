import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  
  const sizeClasses = {
    sm: 'px-2.5 py-1 text-12',
    md: 'px-3 py-1.5 text-13',
  }[size];

  const variantClasses = {
    primary: 'bg-accent hover:bg-accent-hover text-white font-semibold',
    secondary: 'bg-panel hover:bg-page text-ink border border-border',
    danger: 'bg-panel hover:bg-status-dead/5 text-status-dead border border-status-dead/30 font-medium',
    ghost: 'text-muted hover:text-ink hover:bg-page',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`${base} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
