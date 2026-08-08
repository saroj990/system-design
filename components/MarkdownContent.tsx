import Link from 'next/link';
import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import MermaidDiagram from './MermaidDiagram';
import PageFooter from './PageFooter';
import LessonNav from './LessonNav';
import type { NavItem } from '@/lib/navigation';

type MarkdownContentProps = {
  content: string;
  showFooter?: boolean;
  currentHref?: string;
  prev?: NavItem;
  next?: NavItem;
};

function resolveHref(href?: string, currentHref?: string): string {
  if (!href) return '#';
  if (href.startsWith('http') || href.startsWith('mailto:')) return href;

  let path = href.replace(/^#\//, '/').replace(/\.md$/, '');

  if (path.startsWith('../')) {
    path = '/' + path.slice(3);
  } else if (path.startsWith('case-studies/')) {
    path = '/' + path;
  } else if (path.startsWith('fundamentals/')) {
    path = '/' + path;
  } else if (path.startsWith('thinking/')) {
    path = '/' + path;
  } else if (!path.includes('/') && currentHref) {
    if (currentHref.includes('/fundamentals/')) {
      path = `/fundamentals/${path}`;
    } else if (currentHref.includes('/case-studies/')) {
      path = `/case-studies/${path}`;
    } else if (currentHref.includes('/thinking/')) {
      path = `/thinking/${path}`;
    }
  }

  if (path === '/README' || path === 'README') return '/';
  if (path === '/DEPLOY' || path === 'DEPLOY') return '/deploy';
  if (path === '/how-to-use' || path === 'how-to-use') return '/how-to-use';

  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/DEPLOY') return '/deploy';
  return path;
}

export default function MarkdownContent({
  content,
  showFooter = true,
  currentHref,
  prev,
  next,
}: MarkdownContentProps) {
  return (
    <article className="markdown-section">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children }) => {
            const resolved = resolveHref(href, currentHref);
            if (resolved.startsWith('http')) {
              return (
                <a href={resolved} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            }
            return <Link href={resolved}>{children}</Link>;
          },
          code: ({ className, children }) => {
            const match = /language-mermaid/.exec(className || '');
            if (match) {
              return <MermaidDiagram chart={String(children).trim()} />;
            }
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return <code>{children}</code>;
          },
          pre: ({ children }) => {
            const child = children as ReactElement<{ className?: string }>;
            // Avoid invalid <pre><div> nesting — render diagram without <pre> wrapper
            if (child?.props?.className?.includes('language-mermaid')) {
              return <>{children}</>;
            }
            return <pre>{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {(prev || next) && currentHref && (
        <LessonNav prev={prev} next={next} />
      )}

      {showFooter && <PageFooter />}
    </article>
  );
}
