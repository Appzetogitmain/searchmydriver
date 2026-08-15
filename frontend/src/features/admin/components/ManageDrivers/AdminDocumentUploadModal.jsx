import { useState, useRef, useEffect } from 'react';
import { UploadCloud, X, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { DOCUMENT_LABELS } from '../../../../utils/documents';

const AdminDocumentUploadModal = ({
  open,
  onClose,
  driverId,
  editingDocument = null,
  onSuccess,
}) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [docType, setDocType] = useState('driving_license');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (editingDocument) {
        setDocType(editingDocument.type || 'driving_license');
        setPreview(editingDocument.fileUrl || null);
        setFile(null);
      } else {
        setDocType('driving_license');
        setPreview(null);
        setFile(null);
      }
    }
  }, [open, editingDocument]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(selected);
  };

  const handleSave = async () => {
    if (!file && !editingDocument?.fileUrl) {
      toast.error('Please select a document image file');
      return;
    }

    setLoading(true);
    try {
      let finalUrl = editingDocument?.fileUrl || null;

      if (file) {
        // Step 1: Upload new file image
        const formData = new FormData();
        formData.append('media', file);

        const uploadRes = await api.post('/admin/ads/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        finalUrl = uploadRes.data?.data?.url || uploadRes.data?.data?.mediaUrl;
        if (!finalUrl) {
          throw new Error('Failed to get uploaded file URL');
        }
      }

      // Step 2: Save / update driver document record
      await api.put(`/admin/drivers/${driverId}/documents`, {
        docId: editingDocument?._id,
        type: docType,
        fileUrl: finalUrl,
        status: 'approved',
      });

      toast.success(
        editingDocument ? 'Document updated successfully' : 'Document uploaded successfully'
      );
      setFile(null);
      setPreview(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = Boolean(editingDocument);

  return (
    <Modal isOpen={open} onClose={() => !loading && onClose()}>
      <div className="flex flex-col bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Edit Document' : 'Upload Document'}
          </h2>
          <button
            onClick={() => !loading && onClose()}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900"
            >
              {Object.entries(DOCUMENT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEditing ? 'Document Image (Click to change)' : 'Upload Image'}
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                preview
                  ? 'border-slate-800 bg-slate-50'
                  : 'border-gray-200 hover:border-slate-800 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <div className="relative flex flex-col items-center">
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-44 object-contain rounded-lg shadow-sm"
                  />
                  <p className="text-xs text-slate-600 mt-2 font-medium">
                    Click to replace image
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-gray-400">
                  <UploadCloud className="w-8 h-8 mb-2" />
                  <p className="text-sm font-medium">Click to browse image</p>
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => !loading && onClose()} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || (!file && !editingDocument?.fileUrl)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isEditing ? (
              <Save className="w-4 h-4" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Upload Document'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AdminDocumentUploadModal;
