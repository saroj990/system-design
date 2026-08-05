'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GITHUB_REPO, LIVE_SITE, navigation } from '@/lib/navigation';
import ThemeToggle from './ThemeToggle';

type SidebarProps = {
  id?: string;
  open?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ id = 'app-sidebar', open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside id={id} className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <Link href="/" className="sidebar-title" onClick={onClose}>
            System Design
          </Link>
          <div className="sidebar-header-actions">
            <a href={LIVE_SITE} target="_blank" rel="noopener noreferrer" className="sidebar-chip">
              Live
            </a>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="sidebar-chip">
              GitHub
            </a>
            <div className="sidebar-desktop-theme">
              <ThemeToggle />
            </div>
            <button
              type="button"
              className="sidebar-close-btn"
              aria-label="Close navigation"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navigation.map((section) => (
          <div key={section.title} className="sidebar-section">
            <p className="sidebar-section-title">{section.title}</p>
            <ul>
              {section.items.map((item) => (
                <li
                  key={item.href}
                  className={pathname === item.href ? 'active' : undefined}
                >
                  {item.href.startsWith('http') ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    <Link href={item.href} onClick={onClose}>
                      {item.title}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
