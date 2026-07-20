import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import StarRating from '../../../../components/StarRating';
import Toggle from '../../../../components/Toggle';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import api from '../../../../utils/api';

/**
 * Driver-side rating screen — surfaces the real customer just rated.
 * Same shape as the user-side `RatePayPage` so the design language
 * stays consistent across both ends of the platform.
 *
 * Submitting POSTs `{ stars, review, questionResponses }` to
 * `/driver/bookings/:id/rate-customer`. After a successful submit (or
 * if the trip has already been rated), we clear the active trip and
 * route the driver back to the home dashboard.
 */
const RateCustomerPage = () => {
  const navigate = useNavigate();
  const booking = useDriverActiveTripStore((s) => s.booking);
  const clear = useDriverActiveTripStore((s) => s.clear);
  const rateCustomer = useDriverActiveTripStore((s) => s.rateCustomer);
  
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({});

  useEffect(() => {
    api.get('/common/settings')
      .then(res => {
        setQuestions(res.data?.data?.driverRatingQuestions || []);
      })
      .catch(() => {});
  }, []);

  const customer = booking?.userId;
  const customerName =
    typeof customer === 'object' && customer?.name ? customer.name : 'Customer';

  const previousRating = booking?.rating?.driver;
  const alreadyRated = previousRating?.stars != null;
  useEffect(() => {
    if (alreadyRated) {
      setRating(Number(previousRating.stars) || 0);
      setReview(previousRating.review || '');
      if (previousRating.questionResponses) {
        const prefilled = {};
        previousRating.questionResponses.forEach(qr => {
          prefilled[qr.questionId] = qr;
        });
        setResponses(prefilled);
      }
    }
  }, [alreadyRated, previousRating]);

  const handleSubmit = async () => {
    if (!rating || submitting) return;
    if (alreadyRated) {
      clear();
      navigate('/driver/home', { replace: true });
      return;
    }
    setSubmitting(true);
    try {
      await rateCustomer({ 
        stars: rating, 
        review: review.trim(),
        questionResponses: Object.values(responses) 
      });
      toast.success('Thanks for your feedback');
      clear();
      navigate('/driver/home', { replace: true });
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Could not submit rating';
      toast.error(message);
      if (err?.response?.status === 409) {
        clear();
        navigate('/driver/home', { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    clear();
    navigate('/driver/home', { replace: true });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <h1 className="text-xl font-bold text-text mb-2 animate-fade-in-up">
        Rate Customer
      </h1>
      <p className="text-sm text-text-muted mb-6 animate-fade-in-up">
        How was your experience with the customer?
      </p>

      {booking?.offlineTip > 0 && !alreadyRated && (
        <div className="w-full mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3 animate-fade-in-up">
          <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">
              Collect Offline Tip: ₹{booking.offlineTip}
            </p>
            <p className="text-xs text-orange-700 mt-1">
              The customer added a tip during the trip. Please ensure you collect this amount before completing the trip.
            </p>
          </div>
        </div>
      )}

      <Card className="w-full animate-fade-in-up mb-6">
        <div className="flex items-center gap-3">
          <Avatar name={customerName} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text truncate">{customerName}</p>
            <p className="text-xs text-text-muted truncate">
              {booking?.bookingNumber || 'Recent trip'}
            </p>
          </div>
        </div>
      </Card>

      <div className="animate-bounce-in mb-6">
        <StarRating
          value={rating}
          onChange={alreadyRated ? () => {} : setRating}
          size="lg"
          showLabel
        />
      </div>

      {questions.length > 0 && (
        <div className="w-full space-y-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {questions.map((q) => (
            <Card key={q.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">{q.question}</span>
              <div className="shrink-0">
                {q.type === 'boolean' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">No</span>
                    <Toggle
                      checked={responses[q.id]?.answer || false}
                      onChange={(val) => !alreadyRated && !submitting && setResponses(prev => ({
                        ...prev,
                        [q.id]: { questionId: q.id, question: q.question, answer: val }
                      }))}
                      disabled={alreadyRated || submitting}
                    />
                    <span className="text-xs font-semibold text-slate-500">Yes</span>
                  </div>
                )}
                
                {q.type === 'scale' && (
                  <input 
                    type="range" min="1" max="10" 
                    value={responses[q.id]?.answer || 5}
                    onChange={(e) => !alreadyRated && !submitting && setResponses(prev => ({
                      ...prev,
                      [q.id]: { questionId: q.id, question: q.question, answer: Number(e.target.value) }
                    }))}
                    disabled={alreadyRated || submitting}
                    className="w-full accent-primary"
                  />
                )}
                
                {q.type === 'text' && (
                  <input 
                    type="text"
                    value={responses[q.id]?.answer || ''}
                    onChange={(e) => !alreadyRated && !submitting && setResponses(prev => ({
                      ...prev,
                      [q.id]: { questionId: q.id, question: q.question, answer: e.target.value }
                    }))}
                    placeholder="Your answer..."
                    disabled={alreadyRated || submitting}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:border-primary/50 transition-colors w-full sm:w-48"
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="w-full animate-fade-in-up mb-6">
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Leave a comment (optional)"
          readOnly={alreadyRated}
          className="w-full p-4 rounded-xl border border-border bg-background-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all resize-none text-sm"
          rows={3}
        />
      </div>

      <div className="w-full space-y-3 animate-fade-in-up">
        <Button
          fullWidth
          disabled={!rating || submitting}
          onClick={handleSubmit}
        >
          {alreadyRated ? 'Return to Home' : submitting ? 'Submitting...' : 'Submit'}
        </Button>

        {!alreadyRated && (
          <Button
            fullWidth
            variant="ghost"
            onClick={handleSkip}
            disabled={submitting}
            className="text-text-muted"
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
};

export default RateCustomerPage;
