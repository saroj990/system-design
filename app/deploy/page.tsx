import MarkdownContent from '@/components/MarkdownContent';
import { readMarkdown } from '@/lib/content';
import { getAdjacentLessons } from '@/lib/navigation';

export default function DeployPage() {
  const content = readMarkdown('DEPLOY.md');
  const { prev, next } = getAdjacentLessons('/deploy');

  return (
    <MarkdownContent
      content={content}
      currentHref="/deploy"
      prev={prev}
      next={next}
    />
  );
}
