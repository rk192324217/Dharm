'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Leaf, Menu, X, User } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  // Quick mock auth state
  const isAuthenticated = false; // Toggle for testing

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Find Food', href: '/browse' },
    { name: 'Donate', href: '/donate' },
    { name: 'Dashboard', href: '/dashboard' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[var(--background)]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--background)]/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--rescue-orange)] to-[var(--cyan-glow)] flex items-center justify-center shadow-[0_0_15px_rgba(255,107,53,0.3)] group-hover:shadow-[0_0_20px_rgba(255,107,53,0.5)] transition-shadow">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
            Dharm
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-white ${
                pathname === link.href ? 'text-[var(--rescue-orange)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          {isAuthenticated ? (
            <Link href="/dashboard">
               <div className="w-9 h-9 rounded-full bg-[var(--surface-light)] flex items-center justify-center hover:bg-[var(--surface-lighter)] transition-colors border border-white/10">
                 <User className="w-5 h-5 text-[var(--text-primary)]" />
               </div>
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors">
                Sign In
              </Link>
              <Link href="/auth/register">
                <PrimaryButton size="sm">Get Started</PrimaryButton>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden p-2 text-gray-400 hover:text-white focus:outline-none"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isMenuOpen && (
        <div className="md:hidden glass-panel border-t border-white/5 py-4 px-4 flex flex-col gap-4 absolute w-full left-0 top-16 shadow-2xl">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-base font-medium py-2 px-3 rounded-lg ${
                pathname === link.href 
                  ? 'bg-[var(--rescue-orange)]/10 text-[var(--rescue-orange)]' 
                  : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'
              }`}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
          
          <div className="h-px w-full bg-white/5 my-2" />
          
          {!isAuthenticated ? (
            <div className="flex flex-col gap-3">
              <Link href="/auth/login" onClick={() => setIsMenuOpen(false)}>
                <PrimaryButton variant="secondary" fullWidth>Sign In</PrimaryButton>
              </Link>
              <Link href="/auth/register" onClick={() => setIsMenuOpen(false)}>
                <PrimaryButton fullWidth>Get Started</PrimaryButton>
              </Link>
            </div>
          ) : (
             <Link href="/dashboard" onClick={() => setIsMenuOpen(false)}>
               <PrimaryButton variant="secondary" fullWidth className="gap-2">
                 <User className="w-4 h-4" /> Profile
               </PrimaryButton>
             </Link>
          )}
        </div>
      )}
    </header>
  );
}
