import React from 'react';
import { WifiOff, ShieldCheck } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/95 border border-amber-500/30 text-amber-300 text-xs shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200">
      <span className="flex h-2 w-2 relative">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
      </span>
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span className="font-medium">Offline Mode</span>
      <span className="text-slate-400 border-l border-slate-700 pl-2 text-[11px] flex items-center gap-1">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        All docs saved locally
      </span>
    </div>
  );
};
