import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Eye,
  Lock,
  ExternalLink,
  X,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import { dedupeDocumentsForDisplay, DOCUMENT_LABELS } from '../../../../utils/documents';
import { formatDate } from '../../../../utils/formatters';
import Card from '../../../../components/Card';
import Badge from '../../../../components/Badge';

const STATUS_CONFIG = {
  verified: {
    label: 'Verified',
    badgeVariant: 'success',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    bg: 'bg-emerald-50/70 border-emerald-200/60',
  },
  approved: {
    label: 'Approved',
    badgeVariant: 'success',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    bg: 'bg-emerald-50/70 border-emerald-200/60',
  },
  pending: {
    label: 'Under Review',
    badgeVariant: 'warning',
    icon: Clock3,
    iconColor: 'text-amber-600',
    bg: 'bg-amber-50/70 border-amber-200/60',
  },
  rejected: {
    label: 'Rejected',
    badgeVariant: 'danger',
    icon: ShieldAlert,
    iconColor: 'text-rose-600',
    bg: 'bg-rose-50/70 border-rose-200/60',
  },
};

const DriverUploadedDocumentsList = ({ documents = [] }) => {
  const [previewDoc, setPreviewDoc] = useState(null);

  // Exclude profile photos / selfies which belong exclusively in the Personal Details section
  const displayDocs = dedupeDocumentsForDisplay(
    (documents || []).filter(
      (d) => d && d.type !== 'profile_picture' && d.type !== 'selfie'
    )
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <FileCheck className="w-4 h-4 text-primary" />
          <h3 className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">
            Uploaded Documents ({displayDocs.length})
          </h3>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          <Lock className="w-3 h-3 text-slate-400" />
          <span>Locked</span>
        </div>
      </div>

      <Card padding="p-3" className="border border-slate-200/90 shadow-sm rounded-3xl">
        {displayDocs.length === 0 ? (
          <div className="py-6 text-center text-xs text-text-muted">
            No documents uploaded yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayDocs.map((doc, idx) => {
              const label =
                DOCUMENT_LABELS[doc.type] ||
                (doc.type ? doc.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Document');
              const statusKey = (doc.verificationStatus || doc.status || 'pending').toLowerCase();
              const meta = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;
              const StatusIcon = meta.icon;
              const uploadedDate = doc.uploadedAt ? formatDate(doc.uploadedAt) : null;

              return (
                <div
                  key={doc._id || `${doc.type}-${idx}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {doc.fileUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ ...doc, label })}
                        className="w-11 h-11 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-300/80 relative group cursor-pointer"
                        title="Click to view full image"
                      >
                        <img
                          src={doc.fileUrl}
                          alt={label}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-3.5 h-3.5 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-slate-200/80 flex items-center justify-center text-slate-500 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {uploadedDate && (
                          <span className="text-[10px] text-slate-500">
                            Uploaded {uploadedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.iconColor}`}
                    >
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      <span>{meta.label}</span>
                    </span>

                    {doc.fileUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc({ ...doc, label })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors"
                        title="View Document"
                        aria-label="View Document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Lock Notice Info banner */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Documents are locked after submission. To update or replace any document, please contact the administrator.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Document Image Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {previewDoc.label}
                </h4>
                {previewDoc.uploadedAt && (
                  <p className="text-[11px] text-slate-500">
                    Uploaded on {formatDate(previewDoc.uploadedAt)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[70vh] overflow-auto">
              <img
                src={previewDoc.fileUrl}
                alt={previewDoc.label}
                className="max-w-full max-h-[65vh] object-contain rounded-lg"
              />
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="text-[11px] text-slate-500">
                Status: <strong className="text-slate-800 capitalize">{previewDoc.verificationStatus || 'Pending'}</strong>
              </span>
              <a
                href={previewDoc.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs"
              >
                <span>Open Original</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverUploadedDocumentsList;
