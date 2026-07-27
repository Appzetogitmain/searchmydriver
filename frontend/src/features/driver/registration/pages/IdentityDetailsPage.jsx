import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import StepIndicator from '../../../../components/StepIndicator';
import Modal from '../../../../components/Modal';
import { ArrowLeft, User, Phone, Lock, MapPin } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

import { driverNeedsPhone, navigateDriverAfterAuth } from '../../../auth/utils/authNavigation';

import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';

const IdentityDetailsPage = () => {
  const navigate = useNavigate();
  const { driver, isAuthenticated, setAuth, updateDriver } = useDriverAuthStore();
  
  useEffect(() => {
    if (!isAuthenticated || !driver) return;
    if (driverNeedsPhone(driver)) {
      navigate('/driver/link-phone', { replace: true });
      return;
    }
  }, [isAuthenticated, driver?.id, driver?.phone, navigate]);

  const [form, setForm] = useState({
    name: driver?.name || '',
    phone: driver?.phone || '',
    password: '',
    referralCode: driver?.referralCode || '',
    zoneId: driver?.homeZone?._id || driver?.homeZone || '',
    languages: (driver?.languages && driver?.languages.length > 0) ? driver.languages.join(', ') : 'English, Hindi'
  });

  const [isPhoneVerified, setIsPhoneVerified] = useState(!!(driver?.phone && driver?.phone.length === 10));
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zones, setZones] = useState([]);

  useEffect(() => {
    if (driver) {
      setForm({
        name: driver.name || '',
        phone: driver.phone || '',
        password: '',
        referralCode: driver.referralCode || '',
        zoneId: driver.homeZone?._id || driver.homeZone || '',
        languages: (driver.languages && driver.languages.length > 0) ? driver.languages.join(', ') : 'English, Hindi'
      });
      setIsPhoneVerified(!!(driver.phone && driver.phone.length === 10));
    }
  }, [driver]);

  useEffect(() => {
    api.get('/common/zones')
      .then(res => {
        setZones(res.data?.data || []);
      })
      .catch(err => console.error('Failed to fetch zones:', err));
  }, []);

  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      setError('');
      await api.post('/driver/auth/send-otp', { 
        phone: form.phone,
        referralCode: form.referralCode 
      });
      setShowOtpModal(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setLoading(true);
      setError('');
      // This endpoint verifies OTP and registers the user
      const res = await api.post('/driver/auth/verify-otp', {
        phone: form.phone,
        otp,
        name: form.name,
        password: form.password,
        referralCode: form.referralCode,
        zoneId: form.zoneId,
        languages: form.languages.split(',').map(l => l.trim()).filter(Boolean),
      });

      // Save driver to store (token is in cookies)
      setAuth(res.data.data.driver);
      
      setIsPhoneVerified(true);
      setShowOtpModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const canVerifyPhone = !!(
    form.name.trim() &&
    (isAuthenticated ? (form.password ? form.password.length >= 6 : true) : (form.password && form.password.length >= 6)) &&
    form.phone &&
    form.phone.length === 10
  );

  const isFormValid = !!(
    canVerifyPhone &&
    form.zoneId &&
    form.languages.trim()
  );

  const handleContinue = async () => {
    if (isPhoneVerified) {
      if (isAuthenticated && driver) {
        try {
          setLoading(true);
          setError('');
          const res = await api.put('/driver/onboarding/step', {
            stepNumber: 1,
            stepData: {
              name: form.name,
              password: form.password || undefined,
              zoneId: form.zoneId,
              languages: form.languages.split(',').map(l => l.trim()).filter(Boolean),
            }
          });
          updateDriver(res.data.data);
          navigate('/driver/register/credentials');
        } catch (err) {
          setError(err.response?.data?.message || 'Failed to update details');
        } finally {
          setLoading(false);
        }
      } else {
        navigate('/driver/register/credentials');
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Identity Legal</h1>
          <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded-full">1/5</span>
        </div>
        <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={1} />
        <p className="text-xs text-text-muted mt-3">Secure account creation</p>
      </div>
      
      <div className="flex-1 flex flex-col px-6 pb-8">
        <div className="flex-1 space-y-4 animate-fade-in-up">

          <Input label="Full name" placeholder="As per Govt. ID" value={form.name} onChange={handleChange('name')} icon={User} />
          <Input label="Password" type="password" placeholder="Min 6 characters" value={form.password} onChange={handleChange('password')} icon={Lock} />
          
          <div>
            <label className="text-sm font-medium text-text mb-1.5 block">Mobile number</label>
            <div className="flex gap-2">
              <div className="h-12 px-3 bg-gray-50 border border-border rounded-xl flex items-center text-sm text-text-secondary font-medium shrink-0">+91</div>
              <div className="flex-1 relative">
                <Input type="tel" placeholder="10-digit number" value={form.phone} onChange={handleChange('phone')} icon={Phone} maxLength={10} disabled={isPhoneVerified} />
                {form.phone.length === 10 && !isPhoneVerified && (
                  <button 
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading || !canVerifyPhone}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary text-text text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Verify'}
                  </button>
                )}
                {isPhoneVerified && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-success text-xs font-bold">
                    ✓ Verified
                  </span>
                )}
              </div>
            </div>
            {error && <p className="text-danger text-xs mt-1">{error}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-text mb-1.5 block">Service Zone</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
                <MapPin className="w-5 h-5" />
              </div>
              <select
                className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-border rounded-xl text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-60 appearance-none"
                value={form.zoneId}
                onChange={handleChange('zoneId')}
                disabled={loading}
              >
                <option value="">Select a zone</option>
                {zones.map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.name} {z.city ? `(${z.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <Input label="Languages Spoken" placeholder="e.g. English, Hindi, Marathi" value={form.languages} onChange={handleChange('languages')} icon={User} disabled={loading} />

          <Input label="Referral Code (Optional)" placeholder="Enter referral code" value={form.referralCode} onChange={handleChange('referralCode')} icon={User} disabled={loading} />

        </div>
        
        <Button 
          fullWidth 
          onClick={isPhoneVerified ? handleContinue : handleSendOtp} 
          disabled={isPhoneVerified ? !isFormValid : !canVerifyPhone}
          className="mt-6 rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
        >
          {isPhoneVerified ? 'CONTINUE' : 'VERIFY PHONE TO CONTINUE'}
        </Button>
      </div>

      {/* OTP Modal */}
      <Modal isOpen={showOtpModal} onClose={() => setShowOtpModal(false)} title="Enter OTP">
        <div className="p-2">
          <p className="text-sm text-text-secondary mb-4">We sent a 6-digit code to +91 {form.phone}</p>
          <Input 
            type="text" 
            placeholder="000000" 
            value={otp} 
            onChange={(e) => setOtp(e.target.value)} 
            maxLength={6} 
            className="text-center text-xl tracking-widest font-mono"
          />
          {error && <p className="text-danger text-xs mt-2 text-center">{error}</p>}
          <Button 
            fullWidth 
            className="mt-6" 
            onClick={handleVerifyOtp} 
            disabled={otp.length !== 6 || loading}
          >
            {loading ? 'Verifying...' : 'Verify & Create Account'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default IdentityDetailsPage;
