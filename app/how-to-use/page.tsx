import MarkdownContent from '@/components/MarkdownContent';
import { readMarkdown } from '@/lib/content';
import { getAdjacentLessons } from '@/lib/navigation';

export default function HowToUsePage() {
  const content = readMarkdown('how-to-use.md');
  const { prev, next } = getAdjacentLessons('/how-to-use');

  return (
    <MarkdownContent
      content={content}
      currentHref="/how-to-use"
      prev={prev}
      next={next}
    />
  );
}
