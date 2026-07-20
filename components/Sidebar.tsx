'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GITHUB_REPO, LIVE_SITE, navigation } from '@/lib/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link href="/" className="sidebar-title">
          System Design
        </Link>
        <div className="sidebar-external">
          <a href={LIVE_SITE} target="_blank" rel="noopener noreferrer">
            Live
          </a>
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
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
                  <Link href={item.href}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
