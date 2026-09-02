import { ChevronDown, MapPin, RefreshCw, Search } from 'lucide-react';

const UserFilters = ({
  search,
  onSearchChange,
  selectedCity = '',
  onCityChange,
  cities = [],
  citiesLoading = false,
  onRefresh,
  refreshing = false,
}) => (
  <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Manage Users</h1>
        <p className="text-sm text-slate-500 mt-1">View customer accounts, vehicles, and onboarding</p>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
        {/* City Filter Dropdown */}
        <div className="relative w-full sm:w-48 shrink-0">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={selectedCity || ''}
            onChange={(e) => onCityChange(e.target.value)}
            disabled={citiesLoading}
            className="w-full h-12 pl-10 pr-9 rounded-2xl border border-slate-200 bg-white shadow-sm text-sm font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all appearance-none cursor-pointer disabled:opacity-50"
            title="Filter by Available Service City"
          >
            <option value="">All Cities</option>
            {(Array.isArray(cities) ? cities : []).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 sm:w-72 lg:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone, city..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-slate-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
          />
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 shrink-0 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>
    </div>
  </div>
);

export default UserFilters;
