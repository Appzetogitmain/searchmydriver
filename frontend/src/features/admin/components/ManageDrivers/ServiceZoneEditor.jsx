import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';

const formatZone = (zone) => (zone?.name ? `${zone.name}${zone.city ? ` (${zone.city})` : ''}` : '');

/**
 * Inline "Service zone" value on the admin driver profile, with a pencil
 * that swaps it for a zone dropdown. Rendered inside InfoItem's <p>, so it
 * sticks to inline elements (span / select / button).
 */
const ServiceZoneEditor = ({ driver, onSaved }) => {
  const currentZone = driver?.homeZone && typeof driver.homeZone === 'object' ? driver.homeZone : null;
  const currentZoneId = currentZone?._id || driver?.homeZone || '';

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(String(currentZoneId));
  const [saving, setSaving] = useState(false);
  // Active zones from the public list — `/admin/zones` needs the zones
  // settings permission, which staff who only manage drivers may lack.
  const [zones, setZones] = useState([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    api
      .get('/common/zones')
      .then((res) => {
        if (!cancelled) setZones(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load service zones');
      })
      .finally(() => {
        if (!cancelled) setZonesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const startEditing = () => {
    setSelected(String(currentZoneId));
    setEditing(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (selected === String(currentZoneId)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      // City is left out on purpose so the backend syncs it from the zone.
      await api.put(`/admin/drivers/${driver._id || driver.id}`, { homeZone: selected || null });
      toast.success('Service zone updated');
      setEditing(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update service zone');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{formatZone(currentZone) || driver?.city || '—'}</span>
        <button
          type="button"
          onClick={startEditing}
          title="Change service zone"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
        >
          <Pencil className="w-3 h-3" />
          Change
        </button>
      </span>
    );
  }

  // The current zone may since have been deactivated, so it won't be in the
  // active list — keep it selectable so the dropdown doesn't blank it.
  const options =
    currentZone && !zones.some((z) => String(z._id) === String(currentZone._id))
      ? [...zones, { ...currentZone, inactive: zonesLoaded }]
      : zones;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={saving || !zonesLoaded}
        className="min-w-0 flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
      >
        <option value="">{zonesLoaded ? 'No zone assigned' : 'Loading zones…'}</option>
        {options.map((z) => (
          <option key={z._id} value={z._id}>
            {formatZone(z)}
            {z.inactive ? ' — inactive' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !zonesLoaded}
        title="Save"
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        title="Cancel"
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </span>
  );
};

export default ServiceZoneEditor;
