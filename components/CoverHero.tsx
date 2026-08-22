import Link from 'next/link';
import { GITHUB_REPO } from '@/lib/navigation';

const categories = [
  {
    label: 'Building blocks',
    items: ['URL Shortener', 'Rate Limiter', 'API Gateway', 'Key-Value Store', 'Distributed Cache', 'Distributed Scheduler'],
  },
  {
    label: 'Social & real-time',
    items: ['News Feed', 'Chat', 'Trending Topics', 'Nearby Friends', 'Leaderboard', 'Video Conferencing'],
  },
  {
    label: 'Media & content',
    items: ['Photo Sharing', 'Video Streaming', 'Music Streaming', 'Web Search', 'Web Crawler', 'Search Autocomplete'],
  },
  {
    label: 'Commerce & platform',
    items: ['Ride Sharing', 'Hotel Booking', 'Ticket Booking', 'Payment / Wallet', 'E-commerce', 'Online Code Judge'],
  },
  {
    label: 'Advanced / difficult',
    items: ['Order Matching', 'Distributed Coordination', 'Ad Aggregation', 'Active-Active DB', 'Saga Transactions', 'ML Recommendations', 'Exabyte Storage', 'Amazon S3 Internals', 'Kafka Streaming', 'DDoS Mitigation', 'Email at Scale', 'GitHub at Scale', 'Zomato Food Delivery', 'Flash Sale BBD/GIF'],
  },
];

export default function CoverHero() {
  return (
    <section className="cover-hero">
      <span className="cover-brand">System Design Handbook</span>
      <h1>
        Learn to design systems
        <br />
        that scale
      </h1>
      <p className="cover-tagline">
        From first principles to production-style architectures — with High-Level Design,
        Low-Level Design, and diagrams for every topic.
      </p>

      <div className="cover-stats">
        <div className="cover-stat">
          <span className="cover-stat-num">15</span>
          <span className="cover-stat-label">Fundamentals</span>
        </div>
        <div className="cover-stat">
          <span className="cover-stat-num">41</span>
          <span className="cover-stat-label">Case studies</span>
        </div>
        <div className="cover-stat">
          <span className="cover-stat-num">HLD + LLD</span>
          <span className="cover-stat-label">Every lesson</span>
        </div>
      </div>

      <div className="cover-panel">
        <div className="cover-panel-head">
          <span className="cover-panel-title">What&apos;s inside</span>
          <span className="cover-panel-sub">41 real apps — including advanced designs and an S3 deep dive</span>
        </div>
        <div className="cover-categories">
          {categories.map((cat) => (
            <div key={cat.label} className="cover-category">
              <span className="cover-cat-label">{cat.label}</span>
              <div className="cover-pills">
                {cat.items.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="cover-like">
        👍 Enjoying this handbook? Give it a <strong>star on GitHub</strong> if you find it helpful.
      </p>

      <div className="cover-actions">
        <Link href="/how-to-use" className="cover-btn cover-btn-primary">
          Start learning
        </Link>
        <Link href="/fundamentals/01-what-is-system-design" className="cover-btn cover-btn-secondary">
          Browse fundamentals
        </Link>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="cover-btn cover-btn-star"
        >
          ⭐ Star on GitHub
        </a>
      </div>
    </section>
  );
}
