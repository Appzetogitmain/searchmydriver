import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  FileText,
  X,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Drawer from '../../../components/Drawer';
import api from '../../../utils/api';
import ConfirmDialog from '../../../components/ConfirmDialog';

const ManageWebPages = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPage, setEditingPage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/web-pages/admin');
      setPages(res?.data?.data || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load web pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const handleNew = () => {
    setEditingPage(null);
    setShowForm(true);
  };

  const handleEdit = (page) => {
    setEditingPage(page);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/web-pages/admin/${confirmDelete._id}`);
      toast.success('Page deleted successfully');
      fetchPages();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete page');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-text">Static Pages</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage Privacy Policy, Terms of Service, and other static content
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" onClick={fetchPages} disabled={loading} className="px-3 shrink-0">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleNew} className="flex-1 sm:flex-none">
            <Plus className="w-5 h-5 mr-2" />
            Add New Page
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 text-danger p-4 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {loading && !pages.length ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !pages.length ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-border">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-text">No pages found</h3>
          <p className="text-text-secondary mt-2 mb-6">Create your first static page to display on the website.</p>
          <Button onClick={handleNew}>Create Page</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pages.map((page) => (
            <Card key={page._id} className="p-5 flex flex-col h-full hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-bold text-lg text-text">{page.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-text-secondary bg-bg px-2 py-1 rounded">/{page.slug}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      page.isActive ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {page.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(page)}
                    className="p-2 text-text-secondary hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                    title="Edit Page"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(page)}
                    className="p-2 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg transition-colors"
                    title="Delete Page"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-border/50 text-xs text-text-secondary">
                Last updated: {new Date(page.updatedAt).toLocaleDateString()}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Form Drawer */}
      <Drawer
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingPage ? 'Edit Page' : 'Add New Page'}
        size="lg"
      >
        <PageForm
          page={editingPage}
          onClose={() => setShowForm(false)}
          onSuccess={fetchPages}
        />
      </Drawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete Page"
        message={`Are you sure you want to delete the page "${confirmDelete?.title}"? This cannot be undone.`}
        confirmText="Delete Page"
        isDanger
        loading={deleting}
      />
    </div>
  );
};

const PageForm = ({ page, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    slug: page?.slug || '',
    title: page?.title || '',
    content: page?.content || '',
    isActive: page?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => {
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'slug') {
      value = value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (page) {
        await api.put(`/web-pages/admin/${page._id}`, formData);
        toast.success('Page updated successfully');
      } else {
        await api.post('/web-pages/admin', formData);
        toast.success('Page created successfully');
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save page');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[calc(100vh-80px)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="bg-danger/10 text-danger p-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-medium text-text block">Select Page / Section</label>
          <select
            className="w-full bg-white border border-border rounded-xl p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={formData.slug}
            onChange={(e) => {
              const selectedSlug = e.target.value;
              let defaultTitle = formData.title;
              if (selectedSlug === 'about') defaultTitle = 'About SearchMyDriver';
              if (selectedSlug === 'privacy') defaultTitle = 'Privacy Policy';
              if (selectedSlug === 'terms') defaultTitle = 'Terms of Service';
              setFormData((prev) => ({ ...prev, slug: selectedSlug, title: defaultTitle }));
            }}
          >
            <option value="about">About Company (slug: about)</option>
            <option value="privacy">Privacy Policy (slug: privacy)</option>
            <option value="terms">Terms of Service (slug: terms)</option>
            <option value={formData.slug !== 'about' && formData.slug !== 'privacy' && formData.slug !== 'terms' ? formData.slug : ''}>Custom Slug</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Page Title"
            placeholder="e.g., About SearchMyDriver"
            value={formData.title}
            onChange={handleChange('title')}
            required
          />
          <Input
            label="URL Slug"
            placeholder="e.g., about"
            value={formData.slug}
            onChange={handleChange('slug')}
            required
            helper="Auto-filled matching the system section"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-text mb-1.5 block">
            Page Content (HTML supported)
          </label>
          <textarea
            className="w-full h-96 bg-white border border-border rounded-xl p-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-none font-mono"
            placeholder="Enter the page content here..."
            value={formData.content}
            onChange={handleChange('content')}
            required
          />
        </div>

        <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={formData.isActive}
              onChange={handleChange('isActive')}
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-success transition-colors"></div>
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5 shadow-sm"></div>
          </div>
          <div>
            <div className="font-semibold text-text text-sm">Active</div>
            <div className="text-xs text-text-secondary mt-0.5">
              Make this page visible to users
            </div>
          </div>
        </label>
      </div>

      <div className="p-6 border-t border-border bg-gray-50 shrink-0 flex justify-end gap-3 rounded-b-3xl">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} className="min-w-32">
          {page ? 'Save Changes' : 'Create Page'}
        </Button>
      </div>
    </form>
  );
};

export default ManageWebPages;
