import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import api from '../../../../utils/api';

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'searching', bgClass: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
  { label: 'Confirmed', value: 'driver_assigned', bgClass: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
  { label: 'In Progress', value: 'started', bgClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
  { label: 'Completed', value: 'completed', bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
  { label: 'Cancelled', value: 'cancelled', bgClass: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
];

function getCategoryForStatus(rawStatus) {
  switch (rawStatus) {
    case 'searching':
    case 'pending_assignment':
    case 'no_drivers_found':
    case 'in_emergency_pool':
      return 'searching';
    case 'driver_assigned':
    case 'awaiting_payment':
      return 'driver_assigned';
    case 'en_route':
    case 'arrived':
    case 'started':
      return 'started';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'searching';
  }
}

const BookingStatusDropdown = ({ bookingId, currentStatus, onStatusUpdated }) => {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  const updateCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 176;
      const menuHeight = 220;

      let top = rect.bottom + 6;
      let left = rect.left;

      if (top + menuHeight > window.innerHeight) {
        top = Math.max(10, rect.top - menuHeight - 6);
      }

      if (left + menuWidth > window.innerWidth) {
        left = Math.max(10, window.innerWidth - menuWidth - 16);
      }

      setCoords({ top, left });
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open) {
      updateCoords();
    }
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    const handleClickOutside = (e) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const activeCategory = getCategoryForStatus(status);
  const currentOption = STATUS_OPTIONS.find((opt) => opt.value === activeCategory) || STATUS_OPTIONS[0];

  const handleSelect = async (opt, e) => {
    e.stopPropagation();
    if (updating || opt.value === activeCategory) {
      setOpen(false);
      return;
    }

    setUpdating(true);
    try {
      const res = await api.patch(`/admin/bookings/${bookingId}/status`, { status: opt.value });
      setStatus(opt.value);
      setOpen(false);
      if (onStatusUpdated) {
        onStatusUpdated(res.data?.data || { _id: bookingId, status: opt.value });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update booking status');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        disabled={updating}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all shadow-xs cursor-pointer ${currentOption.bgClass}`}
      >
        {updating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>
            <span>{currentOption.label}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
            }}
            className="w-44 rounded-2xl bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-2xl p-1.5 text-white animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = opt.value === activeCategory;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => handleSelect(opt, e)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/20 text-primary-light font-bold'
                      : 'hover:bg-slate-700/60 text-slate-200'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

export default BookingStatusDropdown;
