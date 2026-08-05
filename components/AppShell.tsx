'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ThemeToggle from '@/components/ThemeToggle';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Close on Escape
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <>
      <header className="mobile-topbar">
        <button
          type="button"
          className="hamburger-btn"
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          onClick={() => setNavOpen((v) => !v)}
        >
          <span className={`hamburger-icon ${navOpen ? 'is-open' : ''}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <Link href="/" className="mobile-topbar-title">
          System Design
        </Link>
        <ThemeToggle />
      </header>

      <div
        className={`sidebar-backdrop ${navOpen ? 'is-open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden={!navOpen}
      />

      <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
        <Sidebar id="app-sidebar" open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="main-content">
          <div className="main-content-inner">{children}</div>
        </main>
      </div>
    </>
  );
}
