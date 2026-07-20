import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import { ShieldCheck, Loader2 } from 'lucide-react';
import api from '../../../../utils/api';

const PrivacyPage = () => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const res = await api.get('/web-pages/common/privacy');
        if (res.data?.data?.content) {
          setContent(res.data.data.content);
        } else {
          setContent('<p>Privacy policy content not found.</p>');
        }
      } catch (err) {
        setContent('<p>Privacy policy content not found.</p>');
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, []);

  return (
    <div className="flex-1 bg-bg px-4 py-5 space-y-4">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white rounded-[28px] p-5 shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.18),_transparent_40%)]" />
        <div className="relative space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
            <ShieldCheck className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Privacy Policy</p>
            <h1 className="text-2xl font-bold mt-1">Your privacy matters</h1>
            <p className="text-sm text-white/75 mt-2 leading-relaxed">
              This page explains how SearchMyDriver uses and protects driver information.
            </p>
          </div>
        </div>
      </div>

      <Card className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div 
            className="prose text-text-secondary whitespace-pre-wrap max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </Card>
    </div>
  );
};

export default PrivacyPage;
