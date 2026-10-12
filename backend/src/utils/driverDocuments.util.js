/**
 * Merge incoming documents into existing array — one entry per type (upsert).
 * @param {import('mongoose').Types.DocumentArray} existingDocs
 * @param {Array<{ type: string; fileUrl: string; cloudinaryPublicId?: string }>} incomingDocs
 */
export function mergeDocumentsByType(existingDocs, incomingDocs) {
  if (!incomingDocs?.length) return;

  for (const incoming of incomingDocs) {
    if (!incoming?.type || !incoming?.fileUrl) continue;

    const idx = existingDocs.findIndex((d) => d.type === incoming.type);
    const payload = {
      type: incoming.type,
      fileUrl: incoming.fileUrl,
      cloudinaryPublicId: incoming.cloudinaryPublicId || '',
      uploadedAt: new Date(),
      verificationStatus: 'pending',
    };

    if (idx >= 0) {
      existingDocs[idx].fileUrl = payload.fileUrl;
      existingDocs[idx].cloudinaryPublicId = payload.cloudinaryPublicId;
      existingDocs[idx].uploadedAt = payload.uploadedAt;
      existingDocs[idx].verificationStatus = 'pending';
    } else {
      existingDocs.push(payload);
    }
  }
}

/**
 * Keep the latest document per type (by uploadedAt).
 * @param {Array} documents
 */
export function dedupeDocumentsByType(documents) {
  if (!documents?.length) return [];

  const byType = new Map();
  for (const doc of documents) {
    if (!doc?.type) continue;
    const prev = byType.get(doc.type);
    const docTime = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : 0;
    const prevTime = prev?.uploadedAt ? new Date(prev.uploadedAt).getTime() : 0;
    if (!prev || docTime >= prevTime) {
      byType.set(doc.type, doc);
    }
  }
  return Array.from(byType.values());
}

/**
 * Document types that hold the driver's face photo: `live_selfie` is captured
 * by the camera during registration, `selfie` is the older / admin-uploaded type.
 */
export const SELFIE_DOCUMENT_TYPES = ['live_selfie', 'selfie'];

/** URL of the most recently uploaded selfie, or '' when there is none. */
export function getSelfieUrl(documents) {
  const latest = dedupeDocumentsByType(documents)
    .filter((d) => SELFIE_DOCUMENT_TYPES.includes(d.type) && d.fileUrl)
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))[0];
  return latest?.fileUrl || '';
}

/**
 * Use the registration selfie as the driver's profile photo, so every
 * customer-facing avatar (booking, nearby drivers, calls, ID card) shows
 * the face the driver captured instead of initials. Mutates `driver`.
 */
export function syncProfilePictureFromSelfie(driver) {
  const url = getSelfieUrl(driver?.documents);
  if (url) driver.profilePicture = url;
}
