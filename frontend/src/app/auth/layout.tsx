import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[var(--background)] relative overflow-hidden">
      {/* Background glow effects for auth pages */}
      <div className="absolute top-0 -left-1/4 w-[600px] h-[600px] bg-[var(--cyan-glow)]/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-[600px] h-[600px] bg-[var(--rescue-orange)]/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <h2 className="text-center text-3xl font-extrabold text-white mb-2">
          Dharm
        </h2>
        <p className="text-center text-sm text-[var(--text-secondary)]">
          Give surplus food a purpose.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {children}
      </div>
    </div>
  );
}
