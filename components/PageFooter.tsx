import Link from 'next/link';
import { GITHUB_REPO, LIVE_SITE } from '@/lib/navigation';

export default function PageFooter() {
  return (
    <footer className="page-footer">
      <div className="page-footer-like">
        <span className="page-footer-icon">👍</span>
        <span>
          Found this helpful? Give the repo a <strong>star on GitHub</strong> — it helps others
          discover this handbook.
        </span>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="page-footer-star"
        >
          Star on GitHub ⭐
        </a>
      </div>
      <div className="page-footer-links">
        <a href={LIVE_SITE}>Live site</a>
        <span>·</span>
        <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
    </footer>
  );
}
