import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet, Plus, ShieldCheck, ChevronRight } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Modal from '../../../../components/Modal';

export default function PaymentMethodsPage() {
  const navigate = useNavigate();
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header title="Payment Methods" onBack={() => navigate('/user/account')} />
      <div className="flex-1 p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-text">No saved cards yet</h2>
              <p className="text-sm text-text-secondary">Payments are handled securely through Razorpay.</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            fullWidth 
            icon={Plus} 
            onClick={() => setIsAddCardOpen(true)}
            className="py-2.5 bg-white border-slate-200"
          >
            Add a Card
          </Button>
        </Card>

        <Card 
          className="p-4 hover:bg-slate-50 transition-colors cursor-pointer" 
          onClick={() => navigate('/user/wallet')}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-text">Wallet available</h2>
              <p className="text-sm text-text-secondary">Use your wallet balance for fast booking payments.</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </div>
        </Card>
      </div>

      <Modal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
        title="Add a New Card"
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4 text-blue-500">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-text mb-2">Secure Card Storage</h3>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            SearchMyDriver uses Razorpay to process payments securely. To save a card, simply select the <b className="text-slate-800">"Save Card"</b> option during your next booking or wallet top-up.
          </p>
          <Button fullWidth onClick={() => {
            setIsAddCardOpen(false);
            navigate('/user/wallet');
          }}>
            Top up Wallet Now
          </Button>
          <button 
            onClick={() => setIsAddCardOpen(false)}
            className="mt-4 text-sm font-semibold text-text-muted hover:text-text transition-colors"
          >
            Got it, thanks
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Header({ title, onBack }) {
  return (
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-text">{title}</h1>
          <p className="text-xs text-text-muted">Manage payment access</p>
        </div>
      </div>
    </div>
  );
}
