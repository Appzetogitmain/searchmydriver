import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MapPin, Users, Wifi, WifiOff, Car, Search, Phone, Star, ShieldCheck, X, ExternalLink, User, Calendar, Award } from 'lucide-react';
import { useGoogleMaps } from '../../../hooks/useGoogleMaps';
import { useFirebaseDriverLocations } from '../../../hooks/useFirebaseDriverLocations';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { createQueryStore } from '../../../store/lib/createQueryStore';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import api from '../../../utils/api';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, GOOGLE_MAP_ID } from '../../../constants/mapDefaults';
import Modal from '../../../components/Modal';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/Button';
import useAdminAuthStore from '../../../store/useAdminAuthStore';

/* ------------------------------------------------------------------ */
/* Snapshot fetcher (Mongo seed)                                       */
/* ------------------------------------------------------------------ */

const useLiveDriversSnapshotStore = createQueryStore(async () => {
  const res = await api.get('/admin/drivers/live');
  return res.data?.data || { items: [], liveLocationReady: false };
});

/* ------------------------------------------------------------------ */
/* Merge logic — Firebase is authoritative; Mongo fills the gaps      */
/* ------------------------------------------------------------------ */

function mergeDrivers(mongoItems, firebaseMap) {
  const out = new Map();
  for (const m of mongoItems || []) {
    if (m.lat && m.lng) {
      out.set(String(m._id), {
        driverId: String(m._id),
        customDriverId: m.driverId || String(m._id).slice(0, 8).toUpperCase(),
        name: m.name,
        phone: m.phone,
        rating: m.rating,
        isOnTrip: m.isOnTrip,
        lat: m.lat,
        lng: m.lng,
        city: m.city,
        profilePicture: m.profilePicture,
        experienceYears: m.experienceYears,
        drivingLicenseNumber: m.drivingLicense?.number,
        approvalStatus: m.approvalStatus,
        source: 'mongo',
        updatedAt: m.lastLocationAt ? new Date(m.lastLocationAt).getTime() : null,
      });
    }
  }
  for (const f of Object.values(firebaseMap || {})) {
    const existing = out.get(f.driverId);
    out.set(f.driverId, {
      ...(existing || { driverId: f.driverId }),
      lat: f.lat,
      lng: f.lng,
      accuracy: f.accuracy,
      heading: f.heading,
      speed: f.speed,
      updatedAt: f.updatedAt,
      isOnTrip: f.isOnTrip ?? existing?.isOnTrip,
      city: existing?.city || '',
      source: 'firebase',
    });
  }
  return Array.from(out.values());
}

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const LiveDriverMap = () => {
  const { maps, AdvancedMarkerElement, PinElement, ready, error } = useGoogleMaps();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const infoWindowRef = useRef(null);
  const markersRef = useRef(new Map()); // id → AdvancedMarkerElement
  const [selectedId, setSelectedId] = useState(null);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const { admin } = useAdminAuthStore();
  const [locationSearching, setLocationSearching] = useState(false);

  // Fetch zones for the dropdown
  const { data: zonesData } = useCachedQuery(useAdminZonesStore, 'admin-zones', {});
  const zones = zonesData || [];

  const visibleZones = useMemo(() => {
    if (!admin || admin.role === 'admin') return zones;
    const allowedIds = new Set((admin.assignedZones || []).map((z) => String(z?._id || z)));
    return zones.filter((z) => allowedIds.has(String(z._id)));
  }, [admin, zones]);

  // Fetch active bookings to get live users
  useEffect(() => {
    api.get('/admin/bookings?limit=100').then(res => {
      const b = res.data?.data?.bookings || [];
      const active = b.filter(x => ['pending', 'assigned', 'driver_arrived', 'in_progress'].includes(x.status));
      const users = active.map(bk => ({
        id: bk.userId?._id || bk._id,
        isUser: true,
        name: bk.userId?.name || 'Unknown User',
        phone: bk.userId?.phone_no || '',
        lat: bk.pickup?.location?.coordinates?.[1] || 0,
        lng: bk.pickup?.location?.coordinates?.[0] || 0,
        bookingId: bk._id,
        city: bk.pickup?.address || '',
      })).filter(u => u.lat && u.lng);
      setActiveUsers(users);
    }).catch(console.error);
  }, []);

  // Live updates from Firebase
  const { map: firebaseMap, disabled: firebaseDisabled, error: firebaseError } =
    useFirebaseDriverLocations();

  // Initial seed from Mongo
  const cacheKey = buildCacheKey('admin-live-drivers', {});
  const { data: seed, refetch } = useCachedQuery(
    useLiveDriversSnapshotStore,
    cacheKey,
    {},
  );

  const allDrivers = useMemo(
    () => mergeDrivers(seed?.items, firebaseMap),
    [seed, firebaseMap],
  );

  // Filter drivers and users by search and zone
  const { filteredDrivers, filteredUsers } = useMemo(() => {
    let d = allDrivers;
    let u = activeUsers;

    if (selectedZone) {
      const zoneObj = zones.find(z => z._id === selectedZone);
      if (zoneObj && zoneObj.center?.coordinates?.length === 2) {
        const zoneLng = zoneObj.center.coordinates[0];
        const zoneLat = zoneObj.center.coordinates[1];
        const radius = zoneObj.radiusKm || 50;

        d = d.filter(driver => {
          const dist = getDistanceFromLatLonInKm(driver.lat, driver.lng, zoneLat, zoneLng);
          return dist <= radius;
        });
        
        u = u.filter(user => {
          const dist = getDistanceFromLatLonInKm(user.lat, user.lng, zoneLat, zoneLng);
          return dist <= radius;
        });
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      d = d.filter(driver => 
        driver.name?.toLowerCase().includes(q) || 
        driver.phone?.includes(q) ||
        driver.driverId?.toLowerCase().includes(q) ||
        driver.customDriverId?.toLowerCase().includes(q) ||
        driver.city?.toLowerCase().includes(q)
      );
      u = u.filter(user => 
        user.name?.toLowerCase().includes(q) || 
        user.phone?.includes(q)
      );
    }

    return { filteredDrivers: d, filteredUsers: u };
  }, [allDrivers, activeUsers, searchQuery, selectedZone, zones]);

  const mapItems = useMemo(() => [...filteredDrivers, ...filteredUsers], [filteredDrivers, filteredUsers]);

  /* ---- Location Geocoding Search Handler (e.g. C21 Vijay Nagar, Indore) ---- */

  const handleLocationSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !maps || !mapInstanceRef.current) return;

    setLocationSearching(true);
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ address: searchQuery }, (results, status) => {
      setLocationSearching(false);
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        mapInstanceRef.current.panTo(loc);
        mapInstanceRef.current.setZoom(15);
      }
    });
  };

  /* ---- init map -------------------------------------------------- */

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new maps.Map(mapRef.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      mapId: GOOGLE_MAP_ID,
      disableDefaultUI: false,
      streetViewControl: false,
      mapTypeControl: false,
    });
    infoWindowRef.current = new maps.InfoWindow();

    // Auto center on assigned zone if scoped
    if (admin?.role !== 'admin' && admin?.assignedZones?.length > 0 && zones?.length > 0) {
      const assignedId = typeof admin.assignedZones[0] === 'object' ? admin.assignedZones[0]._id : admin.assignedZones[0];
      const matchZone = zones.find(z => String(z._id) === String(assignedId));
      if (matchZone && matchZone.center?.coordinates?.length === 2) {
        mapInstanceRef.current.panTo({
          lat: matchZone.center.coordinates[1],
          lng: matchZone.center.coordinates[0],
        });
        mapInstanceRef.current.setZoom(12);
      }
    }
  }, [ready, maps, admin, zones]);

  /* ---- sync markers & click popup --------------------------------------------- */

  const handleMarkerClick = (item, marker) => {
    const id = item.isUser ? item.id : item.driverId;
    setSelectedId(id);

    if (infoWindowRef.current && mapInstanceRef.current) {
      const isDriver = !item.isUser;
      const statusText = isDriver ? (item.isOnTrip ? 'On Trip' : 'Available') : 'Active User';
      const statusColor = isDriver ? (item.isOnTrip ? '#f97316' : '#10b981') : '#3b82f6';
      
      const contentString = `
        <div style="padding: 8px; font-family: system-ui, sans-serif; max-width: 240px;">
          <div style="display: flex; items-center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 14px; color: #0f172a;">${item.name || 'Driver'}</strong>
            <span style="background: ${statusColor}15; color: ${statusColor}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px;">${statusText}</span>
          </div>
          ${item.phone ? `<div style="font-size: 12px; color: #475569; margin-bottom: 4px;">📞 ${item.phone}</div>` : ''}
          ${isDriver && item.customDriverId ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">ID: ${item.customDriverId}</div>` : ''}
          <div style="margin-top: 10px; pt-2; border-top: 1px solid #f1f5f9; display: flex; gap: 6px;">
            <button id="view-details-btn-${id}" style="background: #2563eb; color: #ffffff; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; width: 100%;">View Details</button>
          </div>
        </div>
      `;

      infoWindowRef.current.setContent(contentString);
      infoWindowRef.current.open(mapInstanceRef.current, marker);

      // Attach click handler to InfoWindow button
      setTimeout(() => {
        const btn = document.getElementById(`view-details-btn-${id}`);
        if (btn) {
          btn.onclick = () => setSelectedItemForModal(item);
        }
      }, 100);
    }
  };

  useEffect(() => {
    if (!ready || !mapInstanceRef.current) return;

    const seenIds = new Set();

    for (const item of mapItems) {
      const id = item.isUser ? item.id : item.driverId;
      seenIds.add(id);
      let marker = markersRef.current.get(id);
      if (!marker) {
        const pin = new PinElement({
          background: item.isUser ? '#3b82f6' : (item.isOnTrip ? '#f97316' : '#22c55e'),
          borderColor: '#0f172a',
          glyphColor: '#ffffff',
          scale: item.isUser ? 0.8 : 1.0,
        });
        marker = new AdvancedMarkerElement({
          map: mapInstanceRef.current,
          position: { lat: item.lat, lng: item.lng },
          title: item.name || id,
          content: pin.element,
        });
        marker.addListener('click', () => handleMarkerClick(item, marker));
        markersRef.current.set(id, marker);
      } else {
        marker.position = { lat: item.lat, lng: item.lng };
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current.entries()) {
      if (!seenIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
        if (selectedId === id) setSelectedId(null);
      }
    }
  }, [mapItems, ready, AdvancedMarkerElement, PinElement, selectedId]);

  /* ---- recentre on zone change or first driver ----------------------- */

  useEffect(() => {
    if (!ready || !mapInstanceRef.current) return;
    
    if (selectedZone) {
      const zoneObj = zones.find(z => z._id === selectedZone);
      if (zoneObj && zoneObj.center?.coordinates?.length === 2) {
        mapInstanceRef.current.panTo({ lat: zoneObj.center.coordinates[1], lng: zoneObj.center.coordinates[0] });
        mapInstanceRef.current.setZoom(12);
        return;
      }
    }

    if (mapItems.length === 0) return;
    const c = mapInstanceRef.current.getCenter();
    const isDefault =
      Math.abs(c.lat() - DEFAULT_MAP_CENTER.lat) < 0.001 &&
      Math.abs(c.lng() - DEFAULT_MAP_CENTER.lng) < 0.001;
    if (isDefault) {
      mapInstanceRef.current.panTo({ lat: mapItems[0].lat, lng: mapItems[0].lng });
    }
  }, [mapItems, ready, selectedZone, zones]);

  /* ---- focus a driver on click in side panel ----------------------- */

  const focusItem = (item) => {
    const id = item.isUser ? item.id : item.driverId;
    setSelectedId(id);
    const marker = markersRef.current.get(id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: item.lat, lng: item.lng });
      mapInstanceRef.current.setZoom(16);
      if (marker) handleMarkerClick(item, marker);
    }
  };

  /* ---- counts ----------------------------------------------------- */

  const onlineCount = filteredDrivers.length;
  const onTripCount = filteredDrivers.filter((d) => d.isOnTrip).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Live map</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Real-time tracking of drivers and active users. Search locations (e.g. C21 Vijay Nagar Indore), click driver pins for details.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <form onSubmit={handleLocationSearchSubmit} className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search location (e.g. Vijay Nagar)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 pl-9 pr-10 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {locationSearching ? (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
            ) : (
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold bg-primary text-white px-2 py-1 rounded-lg hover:bg-primary-dark transition"
              >
                Go
              </button>
            )}
          </form>
          
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="w-full sm:w-48 px-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
          >
            <option value="">{admin?.role === 'admin' ? 'All Zones' : 'Assigned Zones'}</option>
            {visibleZones.map(z => (
              <option key={z._id} value={z._id}>{z.name} ({z.city})</option>
            ))}
          </select>
        </div>
      </div>

      {firebaseDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live updates are disabled — set <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
          <code className="font-mono">frontend/.env</code> to enable real-time tracking. Showing Mongo snapshot only.
        </div>
      )}
      {firebaseError && !firebaseDisabled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Firebase subscription error: {firebaseError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Users}
          label="Online drivers"
          value={onlineCount}
          tone="success"
        />
        <StatCard icon={Car} label="On trip" value={onTripCount} tone="warning" />
        <StatCard
          icon={firebaseDisabled ? WifiOff : Wifi}
          label="Live feed"
          value={firebaseDisabled ? 'Off' : 'On'}
          tone={firebaseDisabled ? 'muted' : 'success'}
        />
        <button
          type="button"
          onClick={refetch}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          Refresh snapshot
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[480px]">
          <div ref={mapRef} className="w-full h-[480px] lg:h-[640px]" aria-label="Live driver map" />
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/90 z-20">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-slate-600">Loading map…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-50 p-4 text-center z-20">
              <MapPin className="w-8 h-8 text-rose-400" />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          )}
        </div>

        <DriverSidePanel
          items={mapItems}
          selectedId={selectedId}
          onSelect={focusItem}
          onOpenDetails={(item) => setSelectedItemForModal(item)}
          maps={maps}
        />
      </div>

      {/* Driver Full Details Popover Modal */}
      <DriverDetailModal
        item={selectedItemForModal}
        onClose={() => setSelectedItemForModal(null)}
        maps={maps}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Subcomponents & Details Modal                                       */
/* ------------------------------------------------------------------ */

const TONE_STYLES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  muted: 'bg-slate-50 text-slate-600 border-slate-200',
};

const StatCard = ({ icon: Icon, label, value, tone = 'muted' }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${TONE_STYLES[tone]}`}>
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" />
      <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-2xl font-bold mt-1">{value}</p>
  </div>
);

const LocationLabel = ({ lat, lng, city, maps }) => {
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (city) {
      setAddress(city);
      return;
    }
    if (!maps || !lat || !lng) return;

    const geocoder = new maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const addressComponents = results[0].address_components;
        let shortName = results[0].formatted_address;
        
        const locality = addressComponents.find(c => c.types.includes('locality'))?.long_name;
        const sublocality = addressComponents.find(c => c.types.includes('sublocality'))?.long_name;
        
        if (sublocality && locality) {
          shortName = `${sublocality}, ${locality}`;
        } else if (locality) {
          shortName = locality;
        }

        setAddress(shortName);
      } else {
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    });
  }, [lat, lng, city, maps]);

  return <span>{address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>;
};

const DriverSidePanel = ({ items, selectedId, onSelect, onOpenDetails, maps }) => (
  <div className="rounded-xl border border-slate-200 bg-white max-h-[640px] overflow-y-auto custom-scrollbar">
    <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10 flex justify-between items-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Results ({items.length})
      </p>
    </div>
    {items.length === 0 ? (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-500">No results found.</p>
      </div>
    ) : (
      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const id = item.isUser ? item.id : item.driverId;
          return (
          <li key={id}>
            <div
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition cursor-pointer flex items-center justify-between gap-3 ${
                selectedId === id ? 'bg-primary/5' : ''
              }`}
              onClick={() => onSelect(item)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {item.name || id}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  <LocationLabel lat={item.lat} lng={item.lng} city={item.city} maps={maps} />
                </p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                {item.isUser ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                    User
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      item.isOnTrip
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {item.isOnTrip ? 'On trip' : 'Available'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(item);
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Details
                </button>
              </div>
            </div>
          </li>
          );
        })}
      </ul>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Full Driver / User Details Modal                                    */
/* ------------------------------------------------------------------ */

const DriverDetailModal = ({ item, onClose, maps }) => {
  if (!item) return null;
  const isDriver = !item.isUser;

  return (
    <Modal isOpen={!!item} onClose={onClose} title={isDriver ? 'Driver Details' : 'Active User Details'} size="md">
      <div className="p-5 space-y-5">
        
        {/* Header Profile Info */}
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <Avatar
            src={item.profilePicture || undefined}
            name={item.name || 'Driver'}
            size="xl"
            className="w-16 h-16 text-xl rounded-xl ring-2 ring-primary/20"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900 truncate">{item.name}</h3>
            {item.phone && (
              <p className="text-sm font-semibold text-slate-600 mt-0.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span>{item.phone}</span>
              </p>
            )}
            {isDriver && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  ID: {item.customDriverId || item.driverId}
                </span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  item.isOnTrip ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {item.isOnTrip ? 'On Trip' : 'Available'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] uppercase font-bold text-slate-400">Current Location</p>
            <p className="text-xs font-semibold text-slate-800 mt-1">
              <LocationLabel lat={item.lat} lng={item.lng} city={item.city} maps={maps} />
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] uppercase font-bold text-slate-400">Coordinates</p>
            <p className="text-xs font-mono font-semibold text-slate-800 mt-1">
              {item.lat?.toFixed(4)}, {item.lng?.toFixed(4)}
            </p>
          </div>

          {isDriver && (
            <>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400">License Number</p>
                <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                  {item.drivingLicenseNumber || 'N/A'}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400">Experience</p>
                <p className="text-xs font-bold text-slate-800 mt-1">
                  {item.experienceYears ? `${item.experienceYears} Years` : 'N/A'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {isDriver && (
            <Link
              to={`/admin/drivers/${item.driverId}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white font-semibold text-sm rounded-xl shadow-sm hover:bg-primary-dark transition"
            >
              <span>Full Profile</span>
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
        </div>

      </div>
    </Modal>
  );
};

export default LiveDriverMap;

