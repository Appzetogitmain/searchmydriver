import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const BottomNav = ({ items }) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-40">
      <div className="flex items-center justify-between gap-1 rounded-full border border-border-light bg-surface/80 backdrop-blur-lg px-2 py-1.5 shadow-lg">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
                          (item.matchPaths && item.matchPaths.some(p => location.pathname.startsWith(p)));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 transition-colors ${
                isActive ? 'text-text' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {/* The "tubelight": a shared layout element that slides between
                  tabs, so the glow travels with the route change instead of
                  popping. Rendered before the label so it stays behind it —
                  a negative z-index would fall behind the nav's own surface. */}
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-lamp"
                  className="absolute inset-0 rounded-full bg-primary/20"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-t-full">
                    <div className="absolute w-12 h-6 bg-primary/30 rounded-full blur-md -top-2 -left-2" />
                    <div className="absolute w-8 h-6 bg-primary/30 rounded-full blur-md -top-1" />
                    <div className="absolute w-4 h-4 bg-primary/30 rounded-full blur-sm top-0 left-2" />
                  </div>
                </motion.div>
              )}

              <Icon
                className="relative w-5 h-5 transition-transform duration-200"
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`relative text-[10px] leading-none transition-all ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
