export const DOCUMENT_LABELS = {
  profile_picture: 'Profile Picture',
  driving_license: 'Driving License (Front)',
  driving_license_front: 'Driving License (Front)',
  driving_license_back: 'Driving License (Back)',
  selfie: 'Selfie / Photo',
  aadhaar_front: 'Aadhaar (Front)',
  aadhaar_back: 'Aadhaar (Back)',
  police_verification: 'Police Verification',
  address_proof: 'Electricity Bill / Rent Agreement',
  driver_registration: 'Driver Registration Form',
  live_selfie: 'Live Selfie',
};

/**
 * Document types that hold the driver's face photo: `live_selfie` is captured
 * by the camera during registration, `selfie` is the older / admin-uploaded type.
 */
export const SELFIE_DOCUMENT_TYPES = ['live_selfie', 'selfie'];

/**
 * Best photo of a driver for avatars and ID cards: the latest selfie taken at
 * registration, then `profilePicture`. Returns null when there is none.
 */
export function getDriverPhotoUrl(driver) {
  if (!driver || typeof driver !== 'object') return null;
  const docs = Array.isArray(driver.documents) ? driver.documents : [];
  const selfie = docs
    .filter((d) => SELFIE_DOCUMENT_TYPES.includes(d?.type) && d?.fileUrl)
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))[0];
  return selfie?.fileUrl || driver.profilePicture || driver.avatar || null;
}

export const EMPTY_DOCUMENT = Object.freeze({
  url: null,
  publicId: null,
  loading: false,
});

/**
 * Extract Cloudinary public_id from secure URL (legacy records without stored publicId).
 */
export function publicIdFromCloudinaryUrl(url) {
  if (!url || !url.includes('cloudinary')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^./]+$/);
  return match?.[1] || null;
}

/**
 * API documents[] → map keyed by type (latest per type).
 */
export function documentsArrayToMap(documents, allowedTypes = null) {
  const map = {};
  if (!documents?.length) return map;

  const sorted = [...documents].sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  for (const doc of sorted) {
    if (!doc?.type || !doc?.fileUrl) continue;
    if (allowedTypes && !allowedTypes.includes(doc.type)) continue;
    if (map[doc.type]) continue;

    map[doc.type] = {
      url: doc.fileUrl,
      publicId: doc.cloudinaryPublicId || publicIdFromCloudinaryUrl(doc.fileUrl),
      loading: false,
    };
  }

  return map;
}

/**
 * Local documents map → API payload (one per type).
 */
export function documentsMapToArray(documentsMap) {
  return Object.entries(documentsMap)
    .filter(([, state]) => state?.url && !state.loading)
    .map(([type, state]) => ({
      type,
      fileUrl: state.url,
      ...(state.publicId ? { cloudinaryPublicId: state.publicId } : {}),
    }));
}

/**
 * Dedupe API documents for display (latest per type, preserves fileUrl + type).
 */
export function dedupeDocumentsForDisplay(documents) {
  if (!documents?.length) return [];

  const sorted = [...documents].sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  const seen = new Set();
  return sorted.filter((doc) => {
    if (!doc?.type || seen.has(doc.type)) return false;
    seen.add(doc.type);
    return Boolean(doc.fileUrl);
  });
}
