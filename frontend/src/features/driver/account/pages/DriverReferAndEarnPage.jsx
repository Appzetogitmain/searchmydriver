import React, { useState, useEffect } from 'react';
import {
  Share2,
  Copy,
  Gift,
  Coins,
  CheckCircle2,
  Link as LinkIcon,
  MessageCircle,
  ExternalLink,
  Sparkles,
  Users,
  Wallet,
  ArrowRight,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import api from '../../../../utils/api';
import DriverScreenShell from '../../components/DriverScreenShell';
import { formatCurrency } from '../../../../utils/formatters';

export default function DriverReferAndEarnPage() {
  const driver = useDriverAuthStore((s) => s.driver);
  const [loading, setLoading] = useState(true);
  const [walletStats, setWalletStats] = useState({
    referralEarned: 0,
    referralCount: 0,
  });

  useEffect(() => {
    fetchDriverReferralData();
  }, []);

  const fetchDriverReferralData = async () => {
    try {
      if (!driver?.referralCode) {
        const profileRes = await api.get('/driver/profile');
        if (profileRes.data?.data) {
          useDriverAuthStore.getState().setAuth(profileRes.data.data);
        }
      }
      const txnRes = await api.get('/driver/wallet/transactions');
      const txns = txnRes.data?.data?.transactions || txnRes.data?.transactions || [];
      const refTxns = txns.filter(
        (t) => t.source === 'referral_reward' || t.source === 'signup_bonus'
      );
      const totalEarned = refTxns.reduce(
        (acc, t) => acc + (Number(t.amountRupees) || 0),
        0
      );
      setWalletStats({
        referralEarned: totalEarned,
        referralCount: refTxns.length,
      });
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const referralCode = driver?.referralCode ? driver.referralCode.toUpperCase() : 'PENDING';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://searchmydriver.com';
  const referralLink = `${origin}/driver/signup?ref=${referralCode}`;

  const shareMessage = `🚗 Join SearchMyDriver as a Driver Partner!

Sign up using my link to get a bonus on your driver wallet:
👉 ${referralLink}

Or enter my Referral Code during registration:
🔑 Referral Code: ${referralCode}

Start earning with flexible hours and instant payouts!`;

  const copyCode = async () => {
    if (!driver?.referralCode) return;
    try {
      await navigator.clipboard.writeText(driver.referralCode.toUpperCase());
      toast.success('Referral code copied!');
    } catch {
      toast.error('Could not copy referral code');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Application link copied!');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const copyFullMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      toast.success('Full invite message copied!');
    } catch {
      toast.error('Could not copy message');
    }
  };

  const shareWhatsApp = () => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join SearchMyDriver as a Driver Partner',
          text: shareMessage,
          url: referralLink,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyFullMessage();
        }
      }
    } else {
      copyFullMessage();
    }
  };

  return (
    <DriverScreenShell title="Refer & Earn" showBack>
      <div className="flex flex-col flex-1 pb-20">
        {/* Hero Banner */}
        <div className="bg-gradient-to-b from-amber-100 via-amber-50 to-white border-b border-amber-200/70 text-slate-900 pt-5 pb-9 px-6 text-center rounded-b-3xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 translate-x-4 -translate-y-4 w-32 h-32 bg-amber-300/20 rounded-full blur-2xl pointer-events-none" />
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center mx-auto mb-2 text-amber-700 shadow-inner">
            <Gift className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Refer & Earn
          </h1>
          <p className="text-slate-600 text-xs max-w-xs mx-auto mt-1 leading-relaxed">
            Invite fellow drivers with your link & code to earn instant cash rewards in your wallet!
          </p>

          {/* Quick stats chip */}
          {walletStats.referralEarned > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold mt-3 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Total Earned: {formatCurrency(walletStats.referralEarned)}</span>
            </div>
          )}
        </div>

        <div className="px-4 -mt-5 space-y-4">
          {/* Main Referral Sharing Card */}
          <Card className="p-5 shadow-lg border border-slate-200/80 rounded-3xl space-y-4">
            {/* Box 1: Referral Code */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <span>Your Referral Code</span>
                </span>
                <span className="text-[10px] text-primary font-semibold">Share with driver</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 border-2 border-dashed border-slate-300 hover:border-primary/50 rounded-2xl p-3 transition-colors">
                <span className="text-2xl font-mono font-black tracking-widest text-slate-900 select-all pl-2">
                  {referralCode}
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Code</span>
                </button>
              </div>
            </div>

            {/* Box 2: Shareable Application Link */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <LinkIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Application Invite Link</span>
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold">Auto-tracks referral</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2.5 gap-2">
                <p className="text-xs font-mono text-slate-600 truncate flex-1 pl-1 select-all">
                  {referralLink}
                </p>
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Link</span>
                </button>
              </div>
            </div>

            {/* Action Buttons: Simultaneous Share */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* WhatsApp Share */}
              <button
                type="button"
                onClick={shareWhatsApp}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Share via WhatsApp</span>
              </button>

              {/* Native / Multi-app Share */}
              <button
                type="button"
                onClick={shareNative}
                className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-xs shadow-md shadow-slate-900/20 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Link & Code</span>
              </button>
            </div>

            {/* Copy Full Message quick link */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={copyFullMessage}
                className="text-[11px] font-semibold text-slate-500 hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Copy full invitation text with link</span>
              </button>
            </div>
          </Card>

          {/* How It Works Steps */}
          <div className="space-y-3 pt-2">
            <h2 className="font-bold text-sm text-slate-900 px-1">
              How Referral Program Works
            </h2>

            <Card className="p-3.5 flex items-start gap-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xs text-slate-900 mb-0.5">
                  1. Send Link & Code
                </h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Share your link and code with drivers looking for work. When they tap the link, your referral code is automatically attached.
                </p>
              </div>
            </Card>

            <Card className="p-3.5 flex items-start gap-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xs text-slate-900 mb-0.5">
                  2. Driver Registers
                </h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  The new driver completes identity verification and signs up as an active driver partner.
                </p>
              </div>
            </Card>

            <Card className="p-3.5 flex items-start gap-3 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <Coins className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-xs text-slate-900 mb-0.5">
                  3. Earn Wallet Cash
                </h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Both you and your referred driver receive promotional referral credits directly deposited into your driver wallet!
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DriverScreenShell>
  );
}
