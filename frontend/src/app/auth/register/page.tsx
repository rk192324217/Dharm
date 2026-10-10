'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Leaf, UserPlus, Building, User } from 'lucide-react';
import { api } from '@/lib/api';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') === 'receiver' ? 'RECEIVER' : 'DONOR';
  
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'DONOR' | 'RECEIVER'>(initialType);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // mock
  const [orgName, setOrgName] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.users.create({
        email,
        role,
        displayName: name,
        organizationName: orgName || undefined,
      });
      if (res.success) {
        router.push('/dashboard');
      } else {
        alert(res.error?.message || 'Failed to register');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="py-8 px-4 sm:px-10 animate-fade-in-up">
      <div className="mb-6 text-center">
        <h3 className="text-2xl font-bold">Create Account</h3>
        <p className="text-[var(--text-secondary)] text-sm mt-1">Join the food rescue network</p>
      </div>

      {/* Role Selector */}
      <div className="flex bg-[var(--surface-dark)] p-1 rounded-lg mb-6 border border-white/5">
        <button
          type="button"
          onClick={() => setRole('DONOR')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
            role === 'DONOR' 
              ? 'bg-[var(--surface-light)] text-white shadow-sm border border-white/10' 
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <Building className="w-4 h-4" /> Donor
        </button>
        <button
          type="button"
          onClick={() => setRole('RECEIVER')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
            role === 'RECEIVER' 
              ? 'bg-[var(--surface-light)] text-white shadow-sm border border-white/10' 
              : 'text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <User className="w-4 h-4" /> Receiver (NPO)
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleRegister}>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Full Name
          </label>
          <input
            type="text"
            required
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] transition-all"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Email address
          </label>
          <input
            type="email"
            required
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] transition-all"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            {role === 'DONOR' ? 'Business/Restaurant Name (Optional)' : 'Organization Name'}
          </label>
          <input
            type="text"
            required={role === 'RECEIVER'}
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] transition-all"
            placeholder={role === 'DONOR' ? "Jane's Bakery" : "City Food Bank"}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Password
          </label>
          <input
            type="password"
            required
            className="w-full bg-[var(--surface-dark)] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--cyan-glow)] transition-all"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="pt-2">
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
                Create Account <UserPlus className="w-4 h-4" />
              </>
            )}
          </PrimaryButton>
        </div>
      </form>

      <div className="mt-6 text-center text-sm">
        <span className="text-[var(--text-secondary)]">Already have an account? </span>
        <Link href="/auth/login" className="font-medium text-[var(--cyan-glow)] hover:text-white transition-colors">
          Sign In
        </Link>
      </div>
    </GlassCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
