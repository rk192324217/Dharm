'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Leaf, Shield, Users } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { FoodCard } from '@/components/ui/FoodCard';
import { api } from '@/lib/api';
import type { Donation } from '@/lib/types';

export default function HomePage() {
  const [recentDonations, setRecentDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDonations() {
      try {
        const res = await api.donations.list({ status: 'AVAILABLE', limit: 3 });
        if (res.success && res.data) {
          // In actual API might return { items: [] } or just []
          setRecentDonations(Array.isArray(res.data) ? res.data : (res.data as any).items || []);
        }
      } catch (e) {
        console.error('Failed to load donations', e);
      } finally {
        setLoading(false);
      }
    }
    loadDonations();
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden py-20">
        {/* Background elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 -left-1/4 w-[800px] h-[800px] bg-[var(--cyan-glow)]/10 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute -bottom-1/4 -right-1/4 w-[800px] h-[800px] bg-[var(--rescue-orange)]/10 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }} />
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdib3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNNTkgNTlMMTkgNTlMMTkgMTlMNTkgMTlMNTkgNTlaIiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] opacity-50" />
        </div>

        <div className="container relative z-10 px-4 mx-auto text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-white/10 mb-8 animate-fade-in-up">
            <span className="flex h-2 w-2 rounded-full bg-[var(--rescue-orange)] animate-pulse"></span>
            <span className="text-sm font-medium text-white/80">Serving San Francisco Area</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 max-w-4xl animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            Give Surplus Food a <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--cyan-glow)] via-blue-400 to-[var(--rescue-orange)] drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Purpose</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-[var(--text-secondary)] max-w-2xl mb-12 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            Connect excess edible food with local charities in real-time. Rescue resources, reduce waste, and build community.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <Link href="/browse">
              <PrimaryButton size="lg" className="w-full sm:w-auto min-w-[200px] gap-2">
                Find Food <ArrowRight className="w-5 h-5" />
              </PrimaryButton>
            </Link>
            <Link href="/donate">
              <PrimaryButton variant="secondary" size="lg" className="w-full sm:w-auto min-w-[200px]">
                Donate Food
              </PrimaryButton>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-[var(--surface-dark)] border-y border-white/5 relative z-10">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Dharm Works</h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">Our platform streamlines the donation process ensuring food reaches those who need it quickly and safely.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <GlassCard hoverEffect glowColor="orange" className="p-8 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--rescue-orange)]/10 flex items-center justify-center mb-6 text-[var(--rescue-orange)]">
                <Leaf className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">1. Post Surplus</h3>
              <p className="text-[var(--text-secondary)]">Restaurants and stores list excess high-quality food with simple details and pick-up windows.</p>
            </GlassCard>

            <GlassCard hoverEffect glowColor="cyan" className="p-8 text-center flex flex-col items-center md:translate-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--cyan-glow)]/10 flex items-center justify-center mb-6 text-[var(--cyan-glow)]">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">2. Smart Matching</h3>
              <p className="text-[var(--text-secondary)]">Verified non-profits in the vicinity are notified instantly based on food types and volume.</p>
            </GlassCard>

            <GlassCard hoverEffect glowColor="green" className="p-8 text-center flex flex-col items-center md:translate-y-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--success-green)]/10 flex items-center justify-center mb-6 text-[var(--success-green)]">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-3">3. Safe Handoff</h3>
              <p className="text-[var(--text-secondary)]">Digital verification ensures secure chain of custody from donation to final distribution.</p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Available Donations Preview */}
      <section className="py-24 relative z-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-end justify-between mb-12">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Available Right Now</h2>
              <p className="text-[var(--text-secondary)]">Fresh surplus items ready for immediate pickup by verified organizations.</p>
            </div>
            <Link href="/browse" className="mt-4 md:mt-0 text-[var(--cyan-glow)] hover:text-white transition-colors font-medium flex items-center gap-2 group">
              View all donations
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-[var(--cyan-glow)] animate-spin"></div>
            </div>
          ) : recentDonations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recentDonations.map((donation) => (
                <div key={donation.donationId} className="animate-fade-in-up">
                  <FoodCard donation={donation} actionText="Request Pickup" />
                </div>
              ))}
            </div>
          ) : (
             <GlassCard className="p-12 text-center flex flex-col items-center max-w-2xl mx-auto border-dashed">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Leaf className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">No donations available</h3>
                <p className="text-[var(--text-secondary)] mb-6">There are currently no active donations in your area. Be the first to donate today!</p>
                <Link href="/donate">
                  <PrimaryButton>Start Donating</PrimaryButton>
                </Link>
             </GlassCard>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--surface-dark)] pointer-events-none" />
        
        <div className="container mx-auto px-4 relative">
          <GlassCard glowColor="cyan" className="p-12 md:p-16 text-center max-w-4xl mx-auto border-t-2 border-t-[var(--cyan-glow)]/50 relative overflow-hidden">
            {/* Glow effect behind CTA */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[var(--cyan-glow)]/5 blur-[100px] pointer-events-none" />
            
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white relative z-10">Join the Rescue Network</h2>
            <p className="text-xl text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto relative z-10">
              Whether you have food to give or communities to feed, we provide the platform to make it happen smoothly.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <Link href="/auth/register?type=donor">
                <PrimaryButton size="lg" className="min-w-[220px]">Register as Donor</PrimaryButton>
              </Link>
              <Link href="/auth/register?type=receiver">
                 <PrimaryButton variant="secondary" size="lg" className="min-w-[220px]">Register as NPO</PrimaryButton>
              </Link>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
