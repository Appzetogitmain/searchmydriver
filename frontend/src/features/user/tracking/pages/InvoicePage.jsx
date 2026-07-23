import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import { ArrowLeft, Download, FileText, CreditCard } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { formatDistance } from '../../../../utils/geo';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';
import { BOOKING_PAYMENT_STATUS } from '../../../../constants/bookingStatus';

/**
 * Trip invoice — backed by the booking object stored in
 * `useUserActiveBookingStore`. Every figure (number, service, distance,
 * duration, total) is computed from real data so the invoice the user
 * sees here matches what's persisted server-side. The download button is
 * left as a hook for the future PDF endpoint.
 */
const InvoicePage = () => {
  const navigate = useNavigate();
  const { id: urlId } = useParams();
  const activeBooking = useUserActiveBookingStore((s) => s.booking);
  const [localBooking, setLocalBooking] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [paying, setPaying] = useState(false);
  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();

  let booking = null;
  if (urlId) {
    booking = activeBooking?._id === urlId ? activeBooking : localBooking;
  } else {
    booking = activeBooking;
  }

  useEffect(() => {
    if (urlId) {
      if (activeBooking && activeBooking._id === urlId) return;
      api.get(`/auth/bookings/${urlId}`).then(res => {
        if (res?.data?.data?.booking) setLocalBooking(res.data.data.booking);
      }).catch(() => {});
    } else {
      if (!activeBooking) useUserActiveBookingStore.getState().fetchActive().catch(() => {});
    }
  }, [urlId, activeBooking]);

  const invoice = useMemo(() => {
    if (!booking) {
      return {
        id: '—',
        date: '—',
        service: '—',
        distance: '—',
        duration: '—',
        total: null,
      };
    }
    // Bookings are not always assigned a separate invoice number — we fall
    // back to the booking number so the user can still reference it with
    // support.
    const id = booking.invoiceNumber || booking.bookingNumber || '—';
    const createdAt = booking.timeline?.completedAt || booking.timeline?.createdAt || booking.createdAt;
    const date = createdAt ? new Date(createdAt).toLocaleString() : '—';

    const service =
      SERVICE_TYPE_LABELS[booking.serviceType] ||
      (booking.serviceType ? `${booking.serviceType}` : 'Trip');

    const distanceMeters =
      booking.distanceMeters ??
      booking.fareSnapshot?.distanceMeters ??
      booking.tripSummary?.distanceMeters ??
      null;
    const distance = distanceMeters != null ? formatDistance(distanceMeters) : '—';

    let duration = '—';
    const startedAt = booking.timeline?.startedAt;
    const completedAt = booking.timeline?.completedAt;
    if (startedAt && completedAt) {
      const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        const minutes = Math.max(1, Math.round(diffMs / 60_000));
        duration = `${minutes} min`;
      }
    }

    // Mirror the same total math as the TripCompleted screen so the two
    // pages can never disagree on what the user owes/paid.
    const base = booking.fareSnapshot?.total || 0;
    // Invoices only include extensions the customer actually paid for.
    // Pending / declined / expired intents must not inflate the bill.
    const extensions = (booking.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    const total = base + extensions || null;

    return { id, date, service, distance, duration, total };
  }, [booking]);

  const handleDownload = async () => {
    if (!booking) return;
    try {
      setDownloading(true);

      // First, trigger a silent token refresh so the cookie is fresh
      await api.post('/auth/refresh-token', {}).catch(() => {});

      const res = await api.get(`/auth/bookings/${booking._id}/invoice`, {
        responseType: 'blob',
      });

      // Check if the response is actually JSON (an error) disguised as a blob
      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        throw new Error(json.message || 'Server error');
      }

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Invoice-${invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Invoice downloaded successfully');
    } catch (error) {
      let message = 'Failed to download invoice';
      if (error?.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const json = JSON.parse(text);
          message = json.message || message;
        } catch (_) { /* ignore */ }
      } else if (error?.message) {
        message = error.message;
      }
      console.error('Invoice download error:', message);
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  };

  const handlePay = async () => {
    if (!booking?._id) return;
    setPaying(true);
    try {
      const res = await api.post(`/auth/bookings/${booking._id}/pay`);
      const order = res?.data?.data?.razorpay;
      if (!order?.orderId) {
        toast.error('Payments are not configured. Please try again later.');
        return;
      }
      await openCheckout({
        razorpay: {
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: order.name,
          description: order.description,
        },
        order: { _id: booking._id },
        driver: null,
        onSuccess: async (response) => {
          const verifyRes = await api.post(`/auth/bookings/${booking._id}/verify-payment`, {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          const updatedBooking = verifyRes?.data?.data?.booking;
          if (updatedBooking) {
            if (activeBooking && activeBooking._id === booking._id) {
              useUserActiveBookingStore.getState().setBooking(updatedBooking);
            } else {
              setLocalBooking(updatedBooking);
            }
          }
          toast.success('Payment successful');
        },
        onDismiss: () => {
          toast('Payment cancelled');
        },
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const isUnpaidOnline = booking?.paymentMethod === 'online' && booking?.paymentStatus !== BOOKING_PAYMENT_STATUS.PAID;
  const busy = paying || checkoutLoading;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Invoice</h1>
        </div>
      </div>

      <div className="flex-1 p-4">
        <Card className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-bold text-text">{invoice.id}</span>
            </div>
            <span className="text-xs text-text-muted">{invoice.date}</span>
          </div>

          <div className="space-y-3 mb-6">
            {[
              ['Service', invoice.service],
              ['Distance', invoice.distance],
              ['Duration', invoice.duration],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-sm text-text-secondary">{label}</span>
                <span className="text-sm font-medium text-text">{value}</span>
              </div>
            ))}
            <div className="h-px bg-border-light" />
            <div className="flex justify-between">
              <span className="text-sm font-bold text-text">Total</span>
              <span className="text-lg font-bold text-text">
                {invoice.total != null ? `₹${invoice.total}` : '—'}
              </span>
            </div>
          </div>

          <Button 
            fullWidth 
            variant="secondary" 
            icon={Download} 
            onClick={handleDownload}
            loading={downloading}
            disabled={busy}
          >
            Download Invoice
          </Button>
        </Card>
      </div>

      <div className="p-4">
        {isUnpaidOnline ? (
          <Button fullWidth onClick={handlePay} loading={busy} icon={CreditCard}>
            Pay Online (₹{invoice.total})
          </Button>
        ) : (
          <Button fullWidth onClick={() => navigate('/user/home')} disabled={busy}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
};

export default InvoicePage;
