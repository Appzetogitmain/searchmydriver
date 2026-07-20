import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Menu,
  X,
  Globe,
} from 'lucide-react';
import api from '../../utils/api';

const Facebook = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const Twitter = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const Instagram = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const Linkedin = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const Youtube = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
  </svg>
);

const Github = (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const ICON_MAP = {
  facebook: Facebook,
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
  github: Github,
  globe: Globe,
};

const LandingLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [socials, setSocials] = useState([]);

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/how-it-works', label: 'How It Works' },
    { path: '/services', label: 'Services' },
    { path: '/testimonials', label: 'Testimonials' },
    { path: '/support', label: 'Support' },
  ];

  const handleNavigate = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  useEffect(() => {
    const fetchSocials = async () => {
      try {
        const res = await api.get('/web-socials/common');
        setSocials(res?.data?.data || []);
      } catch (err) {
        console.warn('Could not load social links for footer:', err);
      }
    };
    fetchSocials();
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-amber-500 selection:text-black flex flex-col justify-between">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavigate('/')}>
            <img src="/images/logo-smd.png" alt="SearchMyDriver" className="h-12 w-auto object-contain" />
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => handleNavigate(link.path)}
                className={`transition-colors cursor-pointer ${
                  isActive(link.path) ? 'text-amber-500 font-bold' : 'text-slate-600 hover:text-amber-500'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => handleNavigate('/driver/login')}
              className="hidden sm:inline-flex items-center text-sm font-bold text-amber-600 hover:text-amber-500 transition-colors px-4 py-2"
            >
              Become a Driver
            </button>
            <button
              onClick={() => handleNavigate('/welcome')}
              className="inline-flex items-center justify-center px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold text-xs sm:text-sm hover:from-amber-400 hover:to-yellow-300 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-amber-500/10"
            >
              Book a Driver <ArrowRight className="ml-1.5 sm:ml-2 w-4 h-4" />
            </button>

            {/* Mobile Hamburger toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 md:hidden transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown Menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 py-4 px-6 flex flex-col gap-4 animate-fade-in shadow-lg">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => handleNavigate(link.path)}
                className={`text-left text-sm font-bold py-2.5 transition-colors ${
                  isActive(link.path) ? 'text-amber-500' : 'text-slate-600 hover:text-amber-500'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => handleNavigate('/driver/login')}
              className="text-left text-sm font-bold py-2.5 text-amber-600 hover:text-amber-500 border-t border-slate-100 pt-3"
            >
              Become a Driver
            </button>
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/images/logo-smd.png" alt="SearchMyDriver" className="h-8 w-auto object-contain" />
          </div>

          {/* Social Links */}
          {socials.length > 0 && (
            <div className="flex items-center gap-4">
              {socials.map((s) => {
                const IconComponent = ICON_MAP[s.icon] || Globe;
                return (
                  <a
                    key={s._id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-full bg-slate-50 hover:bg-amber-500 hover:text-black border border-slate-100 text-slate-500 hover:scale-105 active:scale-95 transition-all"
                    title={s.platform}
                  >
                    <IconComponent className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
          )}

          <p className="text-slate-500 text-xs font-medium">
            &copy; {new Date().getFullYear()} SearchMyDriver. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingLayout;
