import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../utils/api';

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
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
    <div className="pt-24 pb-16 min-h-dvh bg-bg">
      <div className="max-w-3xl mx-auto px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-text-secondary hover:text-primary mb-6 transition-colors font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        
        <h1 className="text-3xl font-bold mb-6 text-text">Privacy Policy</h1>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div 
            className="prose text-text-secondary whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
