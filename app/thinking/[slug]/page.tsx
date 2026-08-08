import { notFound } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import { getThinkingSlugs, readMarkdown } from '@/lib/content';
import { getAdjacentLessons } from '@/lib/navigation';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getThinkingSlugs().map((slug) => ({ slug }));
}

export default async function ThinkingPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = getThinkingSlugs();

  if (!slugs.includes(slug)) notFound();

  const content = readMarkdown(`thinking/${slug}.md`);
  const href = `/thinking/${slug}`;
  const { prev, next } = getAdjacentLessons(href);

  return (
    <MarkdownContent
      content={content}
      currentHref={href}
      prev={prev}
      next={next}
    />
  );
}
