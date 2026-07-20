export type NavItem = {
  title: string;
  href: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const GITHUB_REPO = 'https://github.com/saroj990/system-design';
export const LIVE_SITE = 'https://system-design-dun-sigma.vercel.app';

export const navigation: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { title: 'Home', href: '/' },
      { title: 'How to use this course', href: '/how-to-use' },
      { title: 'Deploy this site', href: '/deploy' },
    ],
  },
  {
    title: 'Part 1 — Fundamentals',
    items: [
      { title: '01. What is System Design?', href: '/fundamentals/01-what-is-system-design' },
      { title: '02. Requirements Gathering', href: '/fundamentals/02-requirements' },
      { title: '03. Back-of-the-Envelope Estimates', href: '/fundamentals/03-estimates' },
      { title: '04. Clients, Servers & APIs', href: '/fundamentals/04-clients-servers-apis' },
      { title: '05. Load Balancing', href: '/fundamentals/05-load-balancing' },
      { title: '06. Databases', href: '/fundamentals/06-databases' },
      { title: '07. Replication & Sharding', href: '/fundamentals/07-replication-sharding' },
      { title: '08. Caching', href: '/fundamentals/08-caching' },
      { title: '09. CAP & Consistency', href: '/fundamentals/09-cap-consistency' },
      { title: '10. Queues & Async Processing', href: '/fundamentals/10-queues-async' },
      { title: '11. CDN & Object Storage', href: '/fundamentals/11-cdn-object-storage' },
      { title: '12. Monolith vs Microservices', href: '/fundamentals/12-monolith-microservices' },
      { title: '13. Reliability, Security & Observability', href: '/fundamentals/13-reliability-security-observability' },
      { title: '14. How to do HLD', href: '/fundamentals/14-how-to-hld' },
      { title: '15. How to do LLD', href: '/fundamentals/15-how-to-lld' },
    ],
  },
  {
    title: 'Part 2 — Case Studies',
    items: [
      { title: '01. URL Shortener', href: '/case-studies/01-url-shortener' },
      { title: '02. Pastebin', href: '/case-studies/02-pastebin' },
      { title: '03. Rate Limiter', href: '/case-studies/03-rate-limiter' },
      { title: '04. Key-Value Store', href: '/case-studies/04-key-value-store' },
      { title: '05. Unique ID Generator', href: '/case-studies/05-unique-id-generator' },
      { title: '06. News Feed', href: '/case-studies/06-news-feed' },
      { title: '07. Chat / Messaging', href: '/case-studies/07-chat-messaging' },
      { title: '08. Photo Sharing', href: '/case-studies/08-photo-sharing' },
      { title: '09. Video Streaming', href: '/case-studies/09-video-streaming' },
      { title: '10. Ride Sharing', href: '/case-studies/10-ride-sharing' },
      { title: '11. Ticket Booking', href: '/case-studies/11-ticket-booking' },
      { title: '12. Web Crawler', href: '/case-studies/12-web-crawler' },
      { title: '13. Search Autocomplete', href: '/case-studies/13-search-autocomplete' },
      { title: '14. Notification System', href: '/case-studies/14-notification-system' },
      { title: '15. Payment / Wallet', href: '/case-studies/15-payment-wallet' },
      { title: '16. E-commerce Catalog & Cart', href: '/case-studies/16-ecommerce' },
      { title: '17. Distributed Cache', href: '/case-studies/17-distributed-cache' },
      { title: '18. File Storage', href: '/case-studies/18-file-storage' },
      { title: '19. Collaborative Docs', href: '/case-studies/19-collaborative-docs' },
      { title: '20. Analytics Pipeline', href: '/case-studies/20-analytics-pipeline' },
    ],
  },
];

export function getAllLessonHrefs(): string[] {
  return navigation.flatMap((section) => section.items.map((item) => item.href));
}

export function getAdjacentLessons(href: string): { prev?: NavItem; next?: NavItem } {
  const all = navigation.flatMap((section) => section.items);
  const index = all.findIndex((item) => item.href === href);
  if (index === -1) return {};
  return {
    prev: index > 0 ? all[index - 1] : undefined,
    next: index < all.length - 1 ? all[index + 1] : undefined,
  };
}
