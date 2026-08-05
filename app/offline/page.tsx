import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Offline — System Design Handbook',
  description: 'You are offline. Previously visited lessons may still be available.',
};

export default function OfflinePage() {
  return (
    <article className="markdown-section offline-page">
      <h1>You&apos;re offline</h1>
      <p>
        This handbook can work without a network — but only for pages you&apos;ve already opened
        (or that were pre-cached after install).
      </p>
      <ul>
        <li>Go back to a lesson you visited earlier</li>
        <li>Reconnect, then browse pages once to cache them for next time</li>
      </ul>
      <p>
        <Link href="/">← Back to home</Link>
      </p>
      <p className="offline-hint">
        Tip: open the fundamentals and a few case studies while online so they stay available offline.
      </p>
    </article>
  );
}
