import React from 'react';
import { Phone, MessageSquare, ShieldCheck, Languages, User } from 'lucide-react';
import Avatar from './Avatar';
import Card from './Card';

const DriverIdCard = ({
  src,
  name,
  rating,
  experienceYears,
  licenseNumber,
  languages = [],
  phone,
  online,
  onMessageClick,
}) => {
  const callHref = phone ? `tel:+91${String(phone).replace(/\D/g, '')}` : null;
  
  // Format license number securely (e.g. MH12 **** 4567)
  const formatLicense = (lic) => {
    if (!lic || lic.length < 8) return lic || 'N/A';
    const firstPart = lic.substring(0, 4);
    const lastPart = lic.substring(lic.length - 4);
    return `${firstPart} **** ${lastPart}`;
  };

  return (
    <Card className="overflow-hidden border-2 border-emerald-100 shadow-sm relative">
      {/* Premium ID Card Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-200" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-50">Verified Driver</span>
        </div>
        <div className="text-[10px] font-mono tracking-widest text-emerald-200/80">
          ID: {formatLicense(licenseNumber)}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar src={src} name={name || 'Driver'} size="xl" online={online} />
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h3 className="text-lg font-black text-gray-900 truncate">{name || 'Driver Name'}</h3>
            
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {rating ? (
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-amber-500">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-bold text-amber-700">{Number(rating).toFixed(1)}</span>
                </div>
              ) : null}
              {experienceYears ? (
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {Math.round(experienceYears)}+ Yrs Exp
                </span>
              ) : null}
            </div>

            {languages && languages.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5">
                <Languages className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-[11px] font-medium text-gray-500">
                  Speaks: {languages.join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
          {callHref && (
            <a
              href={callHref}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Call Driver
            </a>
          )}
          {onMessageClick && (
            <button
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
      </div>
    </Card>
  );
};

export default DriverIdCard;
