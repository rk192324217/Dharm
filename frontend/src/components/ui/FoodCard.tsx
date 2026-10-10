import React from 'react';
import { GlassCard } from './GlassCard';
import { PrimaryButton } from './PrimaryButton';
import { MapPin, Clock, Package } from 'lucide-react';
import type { Donation } from '@/lib/types';
import { FOOD_CATEGORY_LABELS, FOOD_CATEGORY_EMOJI, STORAGE_LABELS } from '@/lib/types';

interface FoodCardProps {
  donation: Donation;
  onAction?: (donation: Donation) => void;
  actionText?: string;
}

export function FoodCard({ donation, onAction, actionText = 'Request Food' }: FoodCardProps) {
  const isAvailable = donation.status === 'AVAILABLE';

  // Format time relative to now (simple version)
  const getExpiryText = (expiryIso?: string) => {
    if (!expiryIso) return 'Unknown expiry';
    const expiry = new Date(expiryIso);
    const now = new Date();
    const diffHours = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 0) return 'Expired';
    if (diffHours < 24) return `Expires in ${diffHours}h`;
    return `Expires in ${Math.round(diffHours / 24)}d`;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'COOKED_MEAL': 
      case 'BAKERY': return 'text-[var(--rescue-orange)]';
      case 'PRODUCE': 
      case 'DAIRY': return 'text-[var(--success-green)]';
      case 'PACKAGED': 
      case 'BEVERAGES': return 'text-[var(--cyan-glow)]';
      default: return 'text-gray-400';
    }
  };

  return (
    <GlassCard hoverEffect glowColor="orange" className="p-5 flex flex-col h-full relative overflow-hidden group">
      {/* Decorative gradient orb */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--rescue-orange)]/10 rounded-full blur-2xl group-hover:bg-[var(--rescue-orange)]/20 transition-colors" />

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <span className={`text-xs font-semibold tracking-wider uppercase flex items-center gap-1 ${getCategoryColor(donation.foodCategory)}`}>
            {FOOD_CATEGORY_EMOJI[donation.foodCategory]} {FOOD_CATEGORY_LABELS[donation.foodCategory]}
          </span>
          <h3 className="text-xl font-bold text-white mt-1 leading-tight">{donation.title}</h3>
        </div>
        
        {/* Status Badge */}
        <div className={`px-2 py-1 rounded-full text-xs font-medium border ${
          isAvailable 
            ? 'bg-[var(--success-green)]/10 text-[var(--success-green)] border-[var(--success-green)]/20' 
            : 'bg-gray-800 text-gray-400 border-gray-700'
        }`}>
          {donation.status}
        </div>
      </div>

      <p className="text-[var(--text-secondary)] text-sm mb-6 flex-grow relative z-10">
        {donation.description || 'No description provided.'}
      </p>

      <div className="space-y-2 mb-6 text-sm text-[var(--text-primary)] relative z-10">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" />
          <span>{donation.quantity} {donation.unit} ({STORAGE_LABELS[donation.storageConditions]})</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span className="truncate">{donation.approximateLocation || 'Location hidden'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className={getExpiryText(donation.pickupDeadline).includes('Expired') ? 'text-red-400' : ''}>
            {getExpiryText(donation.pickupDeadline)}
          </span>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-white/5 relative z-10">
        <PrimaryButton 
          fullWidth 
          variant={isAvailable ? 'primary' : 'secondary'}
          disabled={!isAvailable}
          onClick={() => onAction && onAction(donation)}
        >
          {isAvailable ? actionText : 'Unavailable'}
        </PrimaryButton>
      </div>
    </GlassCard>
  );
}
