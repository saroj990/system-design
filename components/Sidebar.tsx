'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GITHUB_REPO, LIVE_SITE, navigation } from '@/lib/navigation';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <Link href="/" className="sidebar-title">
            System Design
          </Link>
          <div className="sidebar-header-actions">
            <a href={LIVE_SITE} target="_blank" rel="noopener noreferrer" className="sidebar-chip">
              Live
            </a>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="sidebar-chip">
              GitHub
            </a>
            <ThemeToggle />
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
                    <Link href={item.href}>{item.title}</Link>
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
