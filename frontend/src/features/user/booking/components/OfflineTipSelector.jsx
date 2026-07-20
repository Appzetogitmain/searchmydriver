import { useState } from 'react';
import { Plus } from 'lucide-react';

export default function OfflineTipSelector({ value, onChange }) {
  const PRESETS = [20, 40, 60];
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    const val = parseInt(customValue, 10);
    if (!isNaN(val) && val > 0) {
      onChange(val);
      setIsCustom(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
        Extra offline pay (optional tip)
      </p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {PRESETS.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => onChange(value === amt ? 0 : amt)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap border ${
              value === amt
                ? 'bg-primary text-text border-primary'
                : 'bg-white text-text-secondary border-border hover:bg-gray-50'
            }`}
          >
            +₹{amt}
          </button>
        ))}
        {!isCustom && !PRESETS.includes(value) && value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border bg-primary text-text border-primary"
          >
            +₹{value}
          </button>
        )}
        {!isCustom ? (
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border bg-white text-text-secondary border-border hover:bg-gray-50 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Custom
          </button>
        ) : (
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Amount"
              className="w-24 px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:border-primary"
              autoFocus
              onBlur={() => {
                if (!customValue) setIsCustom(false);
              }}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-text text-white text-sm font-semibold"
            >
              OK
            </button>
          </form>
        )}
      </div>
      {value > 0 && (
        <p className="text-[11px] text-emerald-700 font-medium">
          ₹{value} extra tip will be paid directly to the driver
        </p>
      )}
    </div>
  );
}
