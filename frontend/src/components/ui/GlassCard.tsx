import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glowColor?: 'orange' | 'cyan' | 'green' | 'none';
  hoverEffect?: boolean;
}

export function GlassCard({
  children,
  glowColor = 'none',
  hoverEffect = false,
  className = '',
  ...props
}: GlassCardProps) {
  const glowClasses = {
    orange: 'hover:shadow-[0_0_30px_rgba(255,107,53,0.15)] hover:border-[var(--rescue-orange)]/30',
    cyan: 'hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] hover:border-[var(--cyan-glow)]/30',
    green: 'hover:shadow-[0_0_30px_rgba(46,204,113,0.15)] hover:border-[var(--success-green)]/30',
    none: '',
  };

  return (
    <div
      className={`
        glass-panel rounded-2xl border border-white/5 
        ${hoverEffect ? 'transition-all duration-300 hover:-translate-y-1' : ''} 
        ${hoverEffect && glowColor !== 'none' ? glowClasses[glowColor] : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
