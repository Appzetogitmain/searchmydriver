import { Phone, MessageSquare } from 'lucide-react';
import DriverOfficialIdCard from './DriverOfficialIdCard';

/**
 * Customer-facing driver card shown once a driver is assigned: the
 * driver's official ID card (personal details masked) with call /
 * message actions underneath.
 */
const DriverIdCard = ({
  driver,
  src,
  phone,
  onCallClick,
  onMessageClick,
}) => {
  const callHref = phone ? `tel:+91${String(phone).replace(/\D/g, '')}` : null;

  return (
    <div className="space-y-3">
      <DriverOfficialIdCard
        forCustomer
        driver={driver}
        photoUrl={src}
        className="w-full shadow-md"
      />

      {/* Action Buttons */}
      {((onCallClick || callHref) || onMessageClick) && (
        <div className="flex items-center gap-3">
          {(onCallClick || callHref) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onCallClick) {
                  onCallClick();
                } else if (callHref) {
                  window.location.href = callHref;
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Call Driver
            </button>
          )}
          {onMessageClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMessageClick();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverIdCard;
