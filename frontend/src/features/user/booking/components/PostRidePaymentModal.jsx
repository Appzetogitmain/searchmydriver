import { useState, useCallback, useRef, useEffect } from 'react';
import { CreditCard, Wallet, Banknote, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';
import api from '../../../../utils/api';
import Button from '../../../../components/Button';

export default function PostRidePaymentModal({ open, booking }) {
  const [selectedMethod, setSelectedMethod] = useState('online'); // 'online' | 'wallet' | 'cash'
  const [busy, setBusy] = useState(false);
  const checkoutInFlightRef = useRef(false);

  const wallet = useUserWalletStore((s) => s.wallet);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const { openCheckout } = useRazorpayCheckout();

  const setBooking = useUserActiveBookingStore((s) => s.setBooking);
  const createPaymentOrder = useUserActiveBookingStore((s) => s.createPaymentOrder);
  const verifyPayment = useUserActiveBookingStore((s) => s.verifyPayment);

  useEffect(() => {
    if (open) {
      fetchWallet().catch(() => {});
    }
  }, [open, fetchWallet]);

  const fare = booking?.fareSnapshot || {};
  const baseTotal = fare.total || 0;
  const extensionsTotal = (booking?.extensions || []).reduce(
    (sum, ext) => sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
    0
  );
  const totalPayable = baseTotal + extensionsTotal;
  const amountPaid = booking?.payment?.amountPaidRupees || 0;
  const remainingDue = Math.max(0, totalPayable - amountPaid);
  const isPaid = booking?.paymentStatus === 'paid' || remainingDue <= 0;
  const walletBalance = Number(wallet?.balance || 0);

  const handlePayOnline = useCallback(async () => {
    if (busy || checkoutInFlightRef.current || isPaid) return;
    checkoutInFlightRef.current = true;
    setBusy(true);

    try {
      const order = await createPaymentOrder();
      await openCheckout({
        razorpay: {
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency || 'INR',
          name: order.name || 'SearchMyDriver',
          description: order.description || `Trip Payment - ${booking?.bookingNumber}`,
        },
        order: { _id: order.bookingId || booking?._id },
        user: typeof booking?.userId === 'object' ? booking?.userId : null,
        onSuccess: async (response) => {
          try {
            const updated = await verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            toast.success('Payment verified successfully!');
            if (updated) setBooking(updated);
          } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Verification failed');
          } finally {
            checkoutInFlightRef.current = false;
            setBusy(false);
          }
        },
        onDismiss: () => {
          checkoutInFlightRef.current = false;
          setBusy(false);
          toast.error('Payment cancelled');
        },
        onFailed: (err) => {
          checkoutInFlightRef.current = false;
          setBusy(false);
          toast.error(err?.description || 'Online payment failed');
        },
      });
    } catch (err) {
      checkoutInFlightRef.current = false;
      setBusy(false);
      toast.error(err?.response?.data?.message || err?.message || 'Could not initiate online payment');
    }
  }, [busy, isPaid, createPaymentOrder, openCheckout, booking, verifyPayment, setBooking]);

  const handlePayWallet = useCallback(async () => {
    if (busy || isPaid) return;
    if (walletBalance < remainingDue) {
      toast.error('Insufficient wallet balance. Please pay online or with cash.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/auth/bookings/${booking._id}/pay-wallet`);
      toast.success('Paid from wallet successfully!');
      if (res?.data?.data?.booking) {
        setBooking(res.data.data.booking);
      }
      fetchWallet().catch(() => {});
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Wallet payment failed');
    } finally {
      setBusy(false);
    }
  }, [busy, isPaid, walletBalance, remainingDue, booking?._id, setBooking, fetchWallet]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-200" />
            <div>
              <h2 className="text-base font-bold">Trip Ending — Settle Payment</h2>
              <p className="text-[11px] text-emerald-100 font-mono">ID: {booking?.bookingNumber}</p>
            </div>
          </div>
          <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
            {isPaid ? 'Paid' : 'Due'}
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Fare Summary Breakdown */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Base Trip Fare</span>
              <span className="font-medium text-gray-700">₹{Number(fare.baseFare || 0).toLocaleString('en-IN')}</span>
            </div>
            {fare.extras > 0 && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Extra Time / Distance</span>
                <span className="font-medium text-gray-700">₹{Number(fare.extras).toLocaleString('en-IN')}</span>
              </div>
            )}
            {((fare.serviceCharge || 0) + (fare.gst || 0) > 0) && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Taxes & Platform Fees</span>
                <span className="font-medium text-gray-700">₹{Number((fare.serviceCharge || 0) + (fare.gst || 0)).toLocaleString('en-IN')}</span>
              </div>
            )}
            {fare.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-600 font-medium">
                <span>Savings / Discount</span>
                <span>-₹{Number(fare.discount).toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">Total Payable</span>
              <span className="text-2xl font-black text-gray-900 font-mono">
                ₹{Number(remainingDue || totalPayable).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* If already paid */}
          {isPaid ? (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 text-white shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-emerald-950">Payment Confirmed!</h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Your payment of ₹{Number(totalPayable).toLocaleString('en-IN')} was received. The driver will finish the trip shortly.
                </p>
              </div>
            </div>
          ) : (
            /* Payment Selection Options */
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Payment Method</p>

              {/* Razorpay Online */}
              <button
                type="button"
                onClick={() => setSelectedMethod('online')}
                className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition ${
                  selectedMethod === 'online'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedMethod === 'online' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">Pay Online</p>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Instant</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">UPI (GPay/PhonePe), Cards, NetBanking</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'online' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'}`}>
                  {selectedMethod === 'online' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>

              {/* Wallet */}
              <button
                type="button"
                onClick={() => setSelectedMethod('wallet')}
                className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition ${
                  selectedMethod === 'wallet'
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedMethod === 'wallet' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">SearchMyDriver Wallet</p>
                      {walletBalance < remainingDue && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Low Balance</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Available Balance: <span className="font-bold text-gray-800 font-mono">₹{walletBalance.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'wallet' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'}`}>
                  {selectedMethod === 'wallet' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>

              {/* Cash */}
              <button
                type="button"
                onClick={() => setSelectedMethod('cash')}
                className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition ${
                  selectedMethod === 'cash'
                    ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedMethod === 'cash' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Pay Cash to Driver</p>
                    <p className="text-xs text-gray-500 mt-0.5">Pay ₹{Number(remainingDue || totalPayable).toLocaleString('en-IN')} directly to driver</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'cash' ? 'border-amber-600 bg-amber-600' : 'border-gray-300'}`}>
                  {selectedMethod === 'cash' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          )}

          {/* Action CTA */}
          {!isPaid && (
            <div className="pt-2">
              {selectedMethod === 'online' && (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  onClick={handlePayOnline}
                  className="w-full py-4 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-600/20"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Pay ₹${Number(remainingDue).toLocaleString('en-IN')} Online`}
                </Button>
              )}
              {selectedMethod === 'wallet' && (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={busy || walletBalance < remainingDue}
                  onClick={handlePayWallet}
                  className="w-full py-4 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Pay ₹${Number(remainingDue).toLocaleString('en-IN')} from Wallet`}
                </Button>
              )}
              {selectedMethod === 'cash' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                  <p className="text-xs font-bold text-amber-900">
                    Please give ₹{Number(remainingDue).toLocaleString('en-IN')} cash to your driver.
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    Your driver will tap "Confirm Cash Received" on their phone to complete the ride.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
