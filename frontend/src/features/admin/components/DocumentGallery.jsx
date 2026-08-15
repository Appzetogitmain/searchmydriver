import { Pencil, Trash2, ExternalLink } from 'lucide-react';
import { DOCUMENT_LABELS, dedupeDocumentsForDisplay } from '../../../utils/documents';

const DocumentGallery = ({
  documents = [],
  emptyMessage = 'No documents uploaded',
  onEdit,
  onDelete,
}) => {
  const items = dedupeDocumentsForDisplay(documents);

  if (!items.length) {
    return <p className="text-sm text-slate-500 py-4 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {items.map((doc) => {
        const label = DOCUMENT_LABELS[doc.type] || doc.type.replace(/_/g, ' ');
        return (
          <div
            key={doc._id || doc.type}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 aspect-[4/3] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
          >
            {/* Image display */}
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noreferrer"
              title={`View ${label}`}
              className="absolute inset-0 block"
            >
              <img
                src={doc.fileUrl}
                alt={label}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-90 group-hover:opacity-100"
              />
            </a>

            {/* Top right Action Buttons (Edit & Delete) */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(doc);
                  }}
                  title="Edit document"
                  className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md transition-colors shadow"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                  title="Delete document"
                  className="p-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white backdrop-blur-md transition-colors shadow"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Bottom Label Bar */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-900/50 to-transparent p-2.5 pt-6 pointer-events-none flex items-end justify-between z-0">
              <span className="text-xs font-semibold text-white truncate max-w-[80%]">
                {label}
              </span>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto text-slate-300 hover:text-white"
                title="Open full image"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DocumentGallery;
