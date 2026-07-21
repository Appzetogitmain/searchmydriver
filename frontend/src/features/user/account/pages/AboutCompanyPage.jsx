import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import { Building2, Loader2, ShieldCheck, Award, Target, Users } from 'lucide-react';
import api from '../../../../utils/api';

const AboutCompanyPage = () => {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('About SearchMyDriver');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const res = await api.get('/web-pages/common/about');
        if (res.data?.data?.content) {
          setContent(res.data.data.content);
          if (res.data.data.title) setTitle(res.data.data.title);
        } else {
          setContent(`
            <div class="space-y-4">
              <h3 class="text-lg font-bold text-slate-800">Welcome to SearchMyDriver</h3>
              <p>SearchMyDriver is India's leading platform for hiring professional, verified, and background-checked drivers on demand for personal, outstation, and monthly needs.</p>
              <p>Our mission is to provide safe, comfortable, and hassle-free driving services wherever and whenever you need them.</p>
            </div>
          `);
        }
      } catch (err) {
        setContent(`
          <div class="space-y-4">
            <h3 class="text-lg font-bold text-slate-800">Welcome to SearchMyDriver</h3>
            <p>SearchMyDriver is India's leading platform for hiring professional, verified, and background-checked drivers on demand for personal, outstation, and monthly needs.</p>
            <p>Our mission is to provide safe, comfortable, and hassle-free driving services wherever and whenever you need them.</p>
          </div>
        `);
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, []);

  return (
    <div className="flex-1 bg-bg px-4 py-5 space-y-4 max-w-4xl mx-auto">
      <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white rounded-[28px] p-6 shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.18),_transparent_40%)]" />
        <div className="relative space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 backdrop-blur-md">
            <Building2 className="w-6 h-6 text-blue-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-200 font-semibold">SearchMyDriver</p>
            <h1 className="text-2xl font-black mt-1">{title}</h1>
            <p className="text-sm text-blue-100/80 mt-2 leading-relaxed max-w-xl">
              Empowering journeys with safe, reliable, and verified professional drivers across the country.
            </p>
          </div>
        </div>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div 
            className="prose text-text-secondary max-w-none text-sm leading-relaxed space-y-3"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </Card>
    </div>
  );
};

export default AboutCompanyPage;
