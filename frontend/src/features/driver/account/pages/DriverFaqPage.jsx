import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../../../utils/api';

export default function DriverFaqPage() {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState([]);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await api.get('/web-faqs/common?category=driver_app');
        setFaqs(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load FAQs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFaqs();
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/driver/account')} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">Frequently Asked Questions</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-text-muted text-center pt-8">Loading FAQs...</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm text-text-muted text-center pt-8">No FAQs available yet.</p>
        ) : (
          faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div 
                key={faq._id} 
                className="bg-white border border-border-light rounded-2xl overflow-hidden transition-all duration-200 shadow-sm"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full px-4 py-4 flex items-center justify-between gap-4 text-text font-bold text-sm hover:bg-slate-50/50 transition-colors text-left"
                >
                  <span>{faq.question}</span>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-text-muted shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-text-muted shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-sm text-text-secondary leading-relaxed border-t border-border-light pt-3 bg-slate-50/20">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
