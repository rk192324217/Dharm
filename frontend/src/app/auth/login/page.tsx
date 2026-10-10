'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Leaf, LogIn } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Just for mock UI right now

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Mock login logic
    setTimeout(() => {
      setLoading(false);
      router.push('/dashboard');
    }, 1000);
  };

  return (
    <GlassCard className="py-8 px-4 sm:px-10 animate-fade-in-up">
      <div className="mb-6 flex flex-col items-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--rescue-orange)] to-[var(--cyan-glow)] flex items-center justify-center mb-4">
          <Leaf className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-bold">Welcome Back</h3>
        <p className="text-[var(--text-secondary)] text-sm mt-1">Sign in to your account to continue</p>
      </div>

      <form className="space-y-6" onSubmit={handleLogin}>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Email address
          </label>
          <input
            type="email"
            required
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] focus:border-transparent transition-all"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Password
          </label>
          <input
            type="password"
            required
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] focus:border-transparent transition-all"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-[var(--cyan-glow)] focus:ring-[var(--cyan-glow)] focus:ring-offset-gray-900"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-[var(--text-secondary)]">
              Remember me
            </label>
          </div>

          <div className="text-sm">
            <a href="#" className="font-medium text-[var(--cyan-glow)] hover:text-white transition-colors">
              Forgot password?
            </a>
          </div>
        </div>

        <PrimaryButton 
          fullWidth 
          type="submit" 
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Sign In <LogIn className="w-4 h-4" />
            </>
          )}
        </PrimaryButton>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-[var(--surface-light)] px-2 text-[var(--text-secondary)] rounded-md border border-white/5">
              New to Dharm?
            </span>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/auth/register" className="font-medium text-[var(--rescue-orange)] hover:text-white transition-colors">
            Create an account
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}
