import { Navigate, Outlet } from 'react-router-dom';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { isApplicationSubmitted } from '../utils/driverOnboarding';
import BookingOfferModal from '../features/driver/trips/components/BookingOfferModal';
import DriverProfileSync from '../features/driver/components/DriverProfileSync';

const DriverGuard = () => {
  const { isAuthenticated, driver } = useDriverAuthStore();

  if (!isAuthenticated || !driver) {
    return <Navigate to="/driver/login" replace />;
  }

  // Everything below is a redirect decision based on the *cached* driver
  // snapshot. `DriverProfileSync` stays mounted across all of them so the
  // snapshot keeps refreshing — that's what lets an admin-side change
  // (approval, service zone) take effect without a re-login.
  const withSync = (node) => (
    <>
      <DriverProfileSync />
      {node}
    </>
  );

  if (driver.approvalStatus === 'rejected' || driver.approvalStatus === 'under_review') {
    return withSync(<Navigate to="/driver/register/approval" replace />);
  }

  const step = driver.onboardingStep ?? 0;
  const submitted = isApplicationSubmitted(driver);

  if (!submitted && step < 5 && driver.approvalStatus !== 'approved') {
    if (step < 1) return withSync(<Navigate to="/driver/register/identity" replace />);
    if (step === 1) return withSync(<Navigate to="/driver/register/credentials" replace />);
    if (step === 2) return withSync(<Navigate to="/driver/register/bank" replace />);
    if (step === 3) return withSync(<Navigate to="/driver/register/training" replace />);
    if (step === 4) return withSync(<Navigate to="/driver/register/training" replace />);
    return withSync(<Navigate to="/driver/register/credentials" replace />);
  }

  if (driver.approvalStatus !== 'approved') {
    return withSync(<Navigate to="/driver/register/approval" replace />);
  }

  return withSync(
    <>
      <Outlet />
      <BookingOfferModal />
    </>,
  );
};

export default DriverGuard;
