import { notFound } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import { getFundamentalSlugs, readMarkdown } from '@/lib/content';
import { getAdjacentLessons } from '@/lib/navigation';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getFundamentalSlugs().map((slug) => ({ slug }));
}

export default async function FundamentalPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = getFundamentalSlugs();

  if (!slugs.includes(slug)) notFound();

  const content = readMarkdown(`fundamentals/${slug}.md`);
  const href = `/fundamentals/${slug}`;
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
