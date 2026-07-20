import { useState } from 'react';
import { X, Upload, Loader2, FileText } from 'lucide-react';
import api from '../../../../utils/api';
import toast from 'react-hot-toast';

const DOC_TYPES = [
  { value: 'aadhaar_front', label: 'Aadhaar Front' },
  { value: 'aadhaar_back', label: 'Aadhaar Back' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'police_verification', label: 'Police Verification' },
  { value: 'address_proof', label: 'Address Proof' },
  { value: 'selfie', label: 'Selfie' },
];

const UploadDriverDocModal = ({ driver, onClose, onSuccess }) => {
  const [docType, setDocType] = useState('aadhaar_front');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setLoading(true);
    try {
      // 1. Upload file to cloudinary
      const formData = new FormData();
      formData.append('image', file);
      
      const uploadRes = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl = uploadRes.data?.data?.url;
      
      if (!fileUrl) throw new Error('Failed to get file URL from upload');

      // 2. Save document to driver profile
      await api.put(`/admin/drivers/${driver._id}/documents`, {
        type: docType,
        fileUrl,
        status: 'approved'
      });

      toast.success('Document uploaded successfully');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Upload Document</h3>
              <p className="text-xs text-slate-500 font-medium">For {driver.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">File</label>
            <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-6 hover:border-blue-400 hover:bg-blue-50/50 transition-colors group cursor-pointer text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mx-auto mb-2" />
              {file ? (
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">Click to upload image</p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadDriverDocModal;
