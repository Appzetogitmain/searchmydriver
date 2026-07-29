import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import { Headset } from 'lucide-react';
import HelpDeskModal from '../../../../components/HelpDeskModal';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

import { navigateDriverAfterAuth } from '../../../auth/utils/authNavigation';

const DriverSignUpPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, driver } = useDriverAuthStore();
  const [isHelpDeskOpen, setIsHelpDeskOpen] = useState(false);


  useEffect(() => {
    if (isAuthenticated && driver) {
      navigateDriverAfterAuth(navigate, driver);
    }
  }, [isAuthenticated, driver, navigate]);

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh relative">
      <div className="absolute top-4 right-4 z-10">
        <button
          type="button"
          onClick={() => setIsHelpDeskOpen(true)}
          className="p-3 bg-white shadow-md rounded-full text-primary hover:bg-gray-50 transition-colors"
        >
          <Headset className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-4 pb-2">
        <div className="text-center mb-1 animate-fade-in-up w-full max-w-[190px] mx-auto">
          <img src="/images/logo-smd.png" alt="SearchMyDrivers Logo" className="w-full h-auto object-contain" />
        </div>
        <p className="text-black text-[16px] font-semibold mt-1">Drive. Earn. Grow.</p>

        <div className="w-full max-w-[170px] mx-auto mt-4 mb-4 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <img src="/images/car-driver.png" alt="Driver with car" className="w-full h-auto object-contain drop-shadow-xl" />
        </div>
      </div>

      <div className="px-6 pb-4 space-y-2.5 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
        <Button fullWidth size="md" onClick={() => navigate('/driver/register/identity')} className="rounded-full text-sm font-bold shadow-lg shadow-primary/20">
          Sign Up
        </Button>
        <Button variant="outline" fullWidth size="md" onClick={() => navigate('/driver/login')} className="rounded-full text-sm font-bold border-gray-200 text-black">
          Login
        </Button>

        <p className="text-center text-xs text-text-muted mt-1.5">
          Already have an account? <button onClick={() => navigate('/driver/login')} className="text-primary font-semibold hover:underline">Sign in</button>
        </p>
      </div>

      <HelpDeskModal
        isOpen={isHelpDeskOpen}
        onClose={() => setIsHelpDeskOpen(false)}
        userType="driver"
        isPublic
      />
    </div>
  );
};

export default DriverSignUpPage;
