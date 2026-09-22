import { Navigate, Outlet } from 'react-router-dom';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { isApplicationSubmitted } from '../utils/driverOnboarding';

const DriverGuard = () => {
  const { isAuthenticated, driver } = useDriverAuthStore();

  if (!isAuthenticated || !driver) {
    return <Navigate to="/driver/login" replace />;
  }

  if (driver.approvalStatus === 'rejected' || driver.approvalStatus === 'under_review') {
    return <Navigate to="/driver/register/approval" replace />;
  }

  const step = driver.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);

  if (!submitted && step < 5 && driver.approvalStatus !== 'approved') {
    if (step < 1) return <Navigate to="/driver/register/identity" replace />;
    if (step === 1) return <Navigate to="/driver/register/credentials" replace />;
    if (step === 2) return <Navigate to="/driver/register/bank" replace />;
    if (step === 3) return <Navigate to="/driver/register/training" replace />;
    if (step === 4) return <Navigate to="/driver/register/training" replace />;
    return <Navigate to="/driver/register/credentials" replace />;
  }

  if (driver.approvalStatus !== 'approved') {
    return <Navigate to="/driver/register/approval" replace />;
  }

  return <Outlet />;
};

export default DriverGuard;
