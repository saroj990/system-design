import CoverHero from '@/components/CoverHero';
import MarkdownContent from '@/components/MarkdownContent';
import { readMarkdown } from '@/lib/content';

export default function HomePage() {
  const content = readMarkdown('README.md');
  const marker = '## Who this is for';
  const idx = content.indexOf(marker);
  const body = idx >= 0 ? content.slice(idx) : content;

  return (
    <>
      <CoverHero />
      <div className="home-body">
        <MarkdownContent content={body} showFooter={false} />
      </div>
    </>
  );
}
