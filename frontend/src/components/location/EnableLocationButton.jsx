import { MapPin, Loader2 } from 'lucide-react';
import useLocationStatusStore, { LOCATION_STATUS } from '../../store/useLocationStatusStore';

/**
 * Inline "Enable location" action for screens that need a location but
 * don't have one. Tries right away (the tap lets the browser show its
 * permission / turn-on prompt) and opens the guided sheet if that fails.
 */
export default function EnableLocationButton({ className = '', label = 'Enable location' }) {
  const checking = useLocationStatusStore((s) => s.checking);
  const check = useLocationStatusStore((s) => s.check);
  const openSheet = useLocationStatusStore((s) => s.openSheet);

  const handleClick = async (e) => {
    e.stopPropagation();
    const next = await check({ request: true });
    if (next !== LOCATION_STATUS.OK) openSheet();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={checking}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-70 ${className}`}
    >
      {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
      {checking ? 'Checking…' : label}
    </button>
  );
}
