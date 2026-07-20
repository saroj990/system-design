import Link from 'next/link';
import type { NavItem } from '@/lib/navigation';

type LessonNavProps = {
  prev?: NavItem;
  next?: NavItem;
};

export default function LessonNav({ prev, next }: LessonNavProps) {
  return (
    <nav className="lesson-nav">
      {prev ? (
        <Link href={prev.href} className="lesson-nav-link lesson-nav-prev">
          ← {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="lesson-nav-link lesson-nav-next">
          {next.title} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
