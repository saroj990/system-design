import { notFound } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import { getCaseStudySlugs, readMarkdown } from '@/lib/content';
import { getAdjacentLessons } from '@/lib/navigation';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getCaseStudySlugs().map((slug) => ({ slug }));
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = getCaseStudySlugs();

  if (!slugs.includes(slug)) notFound();

  const content = readMarkdown(`case-studies/${slug}.md`);
  const href = `/case-studies/${slug}`;
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
