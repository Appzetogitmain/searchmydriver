import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import Card from "../../../../components/Card";
import Button from "../../../../components/Button";
import Input from "../../../../components/Input";
import Modal from "../../../../components/Modal";
import Toggle from "../../../../components/Toggle";
import api from '../../../../utils/api';

const RatingQuestionsTab = ({ platformSettings, fetchData, isDriverTab = false }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    id: '',
    question: '',
    type: 'boolean',
    isActive: true,
  });

  const ratingQuestions = isDriverTab 
    ? (platformSettings?.driverRatingQuestions || []) 
    : (platformSettings?.ratingQuestions || []);

  const handleOpenNew = () => {
    setEditingIndex(null);
    setForm({
      id: '',
      question: '',
      type: 'boolean',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (idx, q) => {
    setEditingIndex(idx);
    setForm({ ...q });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    const updatedQuestions = [...ratingQuestions];
    if (editingIndex !== null) {
      updatedQuestions[editingIndex] = form;
    } else {
      updatedQuestions.push(form);
    }

    const payload = { ...platformSettings };
    if (isDriverTab) {
      payload.driverRatingQuestions = updatedQuestions;
    } else {
      payload.ratingQuestions = updatedQuestions;
    }

    try {
      await api.put('/admin/platform-settings', payload);
      await fetchData({ silent: true });
      setShowModal(false);
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update rating questions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (idx) => {
    if (!window.confirm('Delete this rating question?')) return;
    const updatedQuestions = ratingQuestions.filter((_, i) => i !== idx);
    
    const payload = { ...platformSettings };
    if (isDriverTab) {
      payload.driverRatingQuestions = updatedQuestions;
    } else {
      payload.ratingQuestions = updatedQuestions;
    }

    try {
      await api.put('/admin/platform-settings', payload);
      await fetchData({ silent: true });
    } catch (err) {
      alert('Delete failed');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Dynamic Rating Questions</h3>
          <p className="text-sm text-slate-500 mt-1">
            {isDriverTab
              ? 'Configure the questions drivers answer when rating a customer post-trip.'
              : 'Configure the questions customers answer when rating a driver post-trip.'}
          </p>
        </div>
        <Button onClick={handleOpenNew} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors">
          <Plus className="w-4 h-4" /> Add Question
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {ratingQuestions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500">No rating questions configured yet.</p>
          </div>
        ) : (
          ratingQuestions.map((q, idx) => (
            <Card key={idx} className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{q.question}</span>
                  {q.isActive ? (
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">Active</span>
                  ) : (
                    <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>ID: {q.id}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span className="capitalize">Type: {q.type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(idx, q)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(idx)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingIndex !== null ? 'Edit Question' : 'Add Question'}>
        <div className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Question ID (Unique key)"
            placeholder={isDriverTab ? "e.g. is_respectful" : "e.g. is_uniform"}
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            required
            disabled={editingIndex !== null}
          />
          <Input
            label="Question Label"
            placeholder={isDriverTab ? "e.g. Was the customer respectful?" : "e.g. Did the driver wear a uniform?"}
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            required
          />
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Answer Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
              required
            >
              <option value="boolean">Yes/No (Boolean)</option>
              <option value="scale">1-5 Scale</option>
              <option value="text">Text Input</option>
            </select>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Toggle
              checked={form.isActive}
              onChange={(val) => setForm({ ...form, isActive: val })}
            />
            <span className="text-sm font-medium text-slate-700">Active (Visible to {isDriverTab ? 'drivers' : 'users'})</span>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Question
            </Button>
          </div>
        </form>
        </div>
      </Modal>
    </div>
  );
};

export default RatingQuestionsTab;
