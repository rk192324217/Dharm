import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function PrimaryButton({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: PrimaryButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-[var(--rescue-orange)] text-white hover:brightness-110 focus:ring-[var(--rescue-orange)] shadow-[0_0_15px_rgba(255,107,53,0.3)] hover:shadow-[0_0_20px_rgba(255,107,53,0.5)]',
    secondary: 'bg-[var(--surface-light)] text-[var(--text-primary)] hover:bg-[var(--surface-lighter)] focus:ring-[var(--cyan-glow)] border border-white/10',
    danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30 focus:ring-red-500 border border-red-500/30',
    success: 'bg-[var(--success-green)] text-white hover:brightness-110 focus:ring-[var(--success-green)] shadow-[0_0_15px_rgba(46,204,113,0.3)]',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
