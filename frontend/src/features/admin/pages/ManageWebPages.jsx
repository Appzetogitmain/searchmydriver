import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  FileText,
  Phone,
  Mail,
  Clock,
  MapPin,
  Save,
  Building2,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Drawer from '../../../components/Drawer';
import api from '../../../utils/api';
import ConfirmDialog from '../../../components/ConfirmDialog';

const ManageWebPages = () => {
  const [activeTab, setActiveTab] = useState('static-pages'); // 'static-pages' | 'contact-info'

  // Static Pages State
  const [pages, setPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [pagesError, setPagesError] = useState('');
  const [editingPage, setEditingPage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Contact Info State
  const [contactInfo, setContactInfo] = useState({
    supportPhone: '2222222222',
    supportEmail: 'support@searchmydriver.com',
    supportDescription:
      'Our support team is available 24/7 to assist you. Choose whichever channel is most convenient for you.',
    responseTime: 'Usually under 15 minutes',
    officeAddress: '123 Main Street, Suite 400, City, Country',
  });
  const [loadingContact, setLoadingContact] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');

  const fetchPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const res = await api.get('/web-pages/admin');
      setPages(res?.data?.data || []);
      setPagesError('');
    } catch (err) {
      setPagesError(err?.response?.data?.message || 'Failed to load web pages');
    } finally {
      setLoadingPages(false);
    }
  }, []);

  const fetchContactInfo = useCallback(async () => {
    setLoadingContact(true);
    try {
      const res = await api.get('/web-pages/admin/contact-info');
      if (res?.data?.data) {
        setContactInfo((prev) => ({ ...prev, ...res.data.data }));
      }
      setContactError('');
    } catch (err) {
      setContactError(err?.response?.data?.message || 'Failed to load contact information');
    } finally {
      setLoadingContact(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
    fetchContactInfo();
  }, [fetchPages, fetchContactInfo]);

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

  const handleContactChange = (field) => (e) => {
    setContactInfo((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSaveContactInfo = async (e) => {
    e.preventDefault();
    setSavingContact(true);
    setContactError('');
    try {
      const res = await api.put('/web-pages/admin/contact-info', contactInfo);
      if (res?.data?.data) {
        setContactInfo((prev) => ({ ...prev, ...res.data.data }));
      }
      toast.success('Contact information updated successfully');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to update contact information';
      setContactError(msg);
      toast.error(msg);
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-text">About Company & Static Pages</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage Privacy Policy, Terms of Service, and Contact Information settings
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {activeTab === 'static-pages' && (
            <>
              <Button variant="outline" onClick={fetchPages} disabled={loadingPages} className="px-3 shrink-0">
                <RefreshCw className={`w-5 h-5 ${loadingPages ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={handleNew} className="flex-1 sm:flex-none">
                <Plus className="w-5 h-5 mr-2" />
                Add New Page
              </Button>
            </>
          )}
          {activeTab === 'contact-info' && (
            <Button variant="outline" onClick={fetchContactInfo} disabled={loadingContact} className="px-3 shrink-0">
              <RefreshCw className={`w-5 h-5 ${loadingContact ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border space-x-6">
        <button
          onClick={() => setActiveTab('static-pages')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeTab === 'static-pages'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-secondary hover:text-text'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Static Pages
          </div>
        </button>
        <button
          onClick={() => setActiveTab('contact-info')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeTab === 'contact-info'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-secondary hover:text-text'
          }`}
        >
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Contact Information
          </div>
        </button>
      </div>

      {/* TAB 1: Static Pages */}
      {activeTab === 'static-pages' && (
        <div className="space-y-6">
          {pagesError && (
            <div className="bg-danger/10 text-danger p-4 rounded-xl text-sm font-medium">
              {pagesError}
            </div>
          )}

          {loadingPages && !pages.length ? (
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
        </div>
      )}

      {/* TAB 2: Contact Information Control */}
      {activeTab === 'contact-info' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Side */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-bold text-text">Contact Details Settings</h2>
                  <p className="text-xs text-text-secondary mt-1">
                    Update phone, email, description, and response time displayed on the public support page
                  </p>
                </div>
                <Building2 className="w-6 h-6 text-primary" />
              </div>

              {contactError && (
                <div className="mb-6 bg-danger/10 text-danger p-4 rounded-xl text-sm font-medium">
                  {contactError}
                </div>
              )}

              {loadingContact ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <form onSubmit={handleSaveContactInfo} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Call Us (Phone Number)"
                      placeholder="e.g. 2222222222"
                      value={contactInfo.supportPhone}
                      onChange={handleContactChange('supportPhone')}
                      required
                    />
                    <Input
                      label="Email Support Address"
                      placeholder="e.g. support@searchmydriver.com"
                      type="email"
                      value={contactInfo.supportEmail}
                      onChange={handleContactChange('supportEmail')}
                      required
                    />
                  </div>

                  <Input
                    label="Response Time Label"
                    placeholder="e.g. Usually under 15 minutes"
                    value={contactInfo.responseTime}
                    onChange={handleContactChange('responseTime')}
                    required
                  />

                  <div>
                    <label className="text-sm font-medium text-text mb-1.5 block">
                      Support Subtitle / Description
                    </label>
                    <textarea
                      rows={3}
                      className="w-full bg-white border border-border rounded-xl p-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-none"
                      placeholder="Enter support description..."
                      value={contactInfo.supportDescription}
                      onChange={handleContactChange('supportDescription')}
                      required
                    />
                  </div>

                  <Input
                    label="Office Address"
                    placeholder="e.g. 123 Main Street, Suite 400, City, Country"
                    value={contactInfo.officeAddress}
                    onChange={handleContactChange('officeAddress')}
                  />

                  <div className="pt-2 flex justify-end">
                    <Button type="submit" loading={savingContact} className="min-w-40">
                      <Save className="w-4 h-4 mr-2" />
                      Save Contact Information
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>

          {/* Live Preview Side */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
                Live Public Preview
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 bg-success/10 text-success rounded-full">
                Interactive
              </span>
            </div>

            <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm space-y-6">
              <h3 className="text-xl font-bold text-slate-950">Contact Information</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                {contactInfo.supportDescription || 'Our support team is available 24/7 to assist you.'}
              </p>

              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-4 text-slate-600">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">CALL US</p>
                    <p className="text-sm font-bold text-slate-900">{contactInfo.supportPhone || '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-600">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">EMAIL SUPPORT</p>
                    <p className="text-sm font-bold text-slate-900">{contactInfo.supportEmail || '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-slate-600">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">RESPONSE TIME</p>
                    <p className="text-sm font-bold text-slate-900">{contactInfo.responseTime || '—'}</p>
                  </div>
                </div>

                {contactInfo.officeAddress && (
                  <div className="flex items-center gap-4 text-slate-600">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-bold uppercase">OFFICE LOCATION</p>
                      <p className="text-sm font-bold text-slate-900">{contactInfo.officeAddress}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Drawer for Static Pages */}
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
