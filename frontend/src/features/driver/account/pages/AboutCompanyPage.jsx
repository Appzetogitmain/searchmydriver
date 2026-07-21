import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import { Building2, Loader2 } from 'lucide-react';
import api from '../../../../utils/api';

const DriverAboutCompanyPage = () => {
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
              <h3 class="text-lg font-bold text-slate-800">About SearchMyDriver Platform</h3>
              <p>SearchMyDriver connects professional drivers with thousands of verified customers every day for hourly, outstation, and monthly trips.</p>
              <p>We are committed to driver safety, transparent payouts, 24/7 dedicated support, and empowering drivers with continuous growth opportunities.</p>
            </div>
          `);
        }
      } catch (err) {
        setContent(`
          <div class="space-y-4">
            <h3 class="text-lg font-bold text-slate-800">About SearchMyDriver Platform</h3>
            <p>SearchMyDriver connects professional drivers with thousands of verified customers every day for hourly, outstation, and monthly trips.</p>
            <p>We are committed to driver safety, transparent payouts, 24/7 dedicated support, and empowering drivers with continuous growth opportunities.</p>
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
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-[28px] p-6 shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.18),_transparent_40%)]" />
        <div className="relative space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 backdrop-blur-md">
            <Building2 className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60 font-semibold">About Company</p>
            <h1 className="text-2xl font-black mt-1">{title}</h1>
            <p className="text-sm text-white/80 mt-2 leading-relaxed max-w-xl">
              Learn more about SearchMyDriver mission, platform guidelines, driver benefits, and company updates.
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

export default DriverAboutCompanyPage;
