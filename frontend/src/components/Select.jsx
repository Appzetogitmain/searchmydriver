import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

const Select = ({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  containerClassName = '',
  searchable = false,
  openDirection = 'bottom',
  icon: Icon,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  const selectedOption = options.find((opt) => {
    const optVal = typeof opt === 'string' ? opt : opt.value;
    return String(optVal) === String(value);
  });

  const displayLabel = selectedOption
    ? typeof selectedOption === 'string'
      ? selectedOption
      : selectedOption.label
    : placeholder;

  const filteredOptions = options.filter((opt) => {
    const labelText = typeof opt === 'string' ? opt : opt.label;
    return String(labelText || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownClasses =
    openDirection === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  const isTall = className.includes('h-12');

  return (
    <div
      className={`flex flex-col gap-1.5 ${isOpen ? 'relative z-50' : 'relative z-10'} ${containerClassName}`}
      ref={dropdownRef}
    >
      {label && <label className="text-sm font-medium text-text">{label}</label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`
            w-full ${className || 'h-10'} bg-white border rounded-xl pr-10 text-sm text-left
            transition-all duration-200 flex items-center
            ${isOpen ? 'border-primary ring-2 ring-primary/30' : 'border-border'}
            ${error ? 'border-danger' : ''}
            ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}
            ${!selectedOption ? 'text-text-muted' : 'text-text'}
            ${Icon ? (isTall ? 'pl-11' : 'pl-9') : 'pl-4'}
          `}
        >
          {Icon && (
            <Icon
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                isTall ? 'w-5 h-5' : 'w-4 h-4'
              } text-text-muted`}
            />
          )}
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${
              isTall ? 'w-5 h-5' : 'w-4 h-4'
            } text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            className={`absolute z-[100] left-0 right-0 ${dropdownClasses} bg-white border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up`}
          >
            {searchable && (
              <div className="p-2 border-b border-gray-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search city..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 bg-bg rounded-lg pl-9 pr-3 text-xs focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-center text-xs text-text-muted">
                  No results found
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  const optLabel = typeof opt === 'string' ? opt : opt.label;
                  const isSelected = String(optValue) === String(value);

                  return (
                    <button
                      key={optValue}
                      type="button"
                      onClick={() => {
                        onChange(optValue);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      className={`
                        w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors
                        ${isSelected ? 'bg-primary/10 text-primary-dark font-medium' : 'text-text hover:bg-gray-50'}
                      `}
                    >
                      <span className="truncate">{optLabel}</span>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
    </div>
  );
};

export default Select;
