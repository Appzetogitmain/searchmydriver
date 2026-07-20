/** Map catalog API items to Select component options */
export function toSelectOptions(items = [], labelKey = 'name') {
  return items.map((item) => ({
    value: String(item._id),
    label: item[labelKey] || item.name,
  }));
}

/** Display helpers for populated or legacy car documents */
export function getCarBrandName(car) {
  if (car?.brandId?.name) return car.brandId.name;
  if (car?.brand) return car.brand;
  // If the user typed a custom modelName, we might not have a brand
  if (car?.modelName) return '';
  return '—';
}

export function getCarModelName(car) {
  return car?.modelId?.name || car?.modelName || car?.model || '—';
}

export function getCarCategoryName(car) {
  return car?.carTypeId?.name || '—';
}

export function getCarFuelName(car) {
  if (car?.fuelTypeId?.name) return car.fuelTypeId.name;
  if (car?.fuelType) return car.fuelType;
  return '';
}

export const TRANSMISSION_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

/** One line label for driver vehicle experience (populated refs). */
export function formatVehicleExperienceLabel(entry) {
  if (!entry) return '—';
  const brand = entry.brandId?.name || '';
  const model = entry.modelId?.name || '';
  const category = entry.carTypeId?.name || '';
  const fuel = entry.fuelTypeId?.name || '';
  const parts = [brand, model].filter(Boolean).join(' ');
  const meta = [category, fuel, entry.transmission].filter(Boolean).join(' · ');
  return parts ? `${parts}${meta ? ` (${meta})` : ''}` : meta || '—';
}
