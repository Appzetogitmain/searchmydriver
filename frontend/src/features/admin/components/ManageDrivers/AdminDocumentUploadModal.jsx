import { useState, useRef } from 'react';
import { UploadCloud, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { DOCUMENT_LABELS } from '../../../../utils/documents';

const AdminDocumentUploadModal = ({ open, onClose, driverId, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [docType, setDocType] = useState('driving_license');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }
    setLoading(true);
    try {
      // Step 1: Upload file to Cloudinary via generic ads/banner upload endpoint
      const formData = new FormData();
      formData.append('media', file);

      const uploadRes = await api.post('/admin/ads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl = uploadRes.data.data.url || uploadRes.data.data.mediaUrl;

      if (!fileUrl) {
        throw new Error('Failed to get file URL from upload endpoint');
      }

      // Step 2: Update driver's document record
      await api.put(`/admin/drivers/${driverId}/documents`, {
        type: docType,
        fileUrl,
        status: 'approved',
      });

      toast.success('Document uploaded successfully');
      setFile(null);
      setPreview(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !loading && onClose()}>
      <div className="flex flex-col bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Upload Document</h2>
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
              className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
              Upload Image
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                preview ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <img src={preview} alt="Preview" className="h-40 object-contain rounded-lg" />
              ) : (
                <div className="flex flex-col items-center py-6 text-gray-400">
                  <UploadCloud className="w-8 h-8 mb-2" />
                  <p className="text-sm font-medium">Click to browse</p>
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
          <Button onClick={handleUpload} disabled={!file || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
            {loading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AdminDocumentUploadModal;
