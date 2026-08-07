'use client';

import { useEffect, useId, useRef, useState } from 'react';

type MermaidDiagramProps = {
  chart: string;
};

function getMermaidTheme(): 'neutral' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral';
}

/**
 * Mermaid 10 treats `(` inside unquoted `[...]` as the start of a shape
 * (stadium/cylinder/etc.), which produces "Syntax error in text".
 * Quote those labels. Leave `[(...)]` cylinders and already-quoted labels alone.
 */
function sanitizeMermaidChart(raw: string): string {
  return raw.replace(
    /(\b\w+)\[(?![\(\["])([^\]]*?\([^ \]]*?)\]/g,
    (_, id: string, label: string) => `${id}["${label.replace(/"/g, '#quot;')}"]`,
  );
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = useId().replace(/:/g, '');
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'neutral' | 'dark'>('neutral');
  const [error, setError] = useState<string | null>(null);

  // Defer all browser-only work until after hydration
  useEffect(() => {
    setMounted(true);
    setTheme(getMermaidTheme());

    const observer = new MutationObserver(() => {
      setTheme(getMermaidTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    let cancelled = false;
    const safeChart = sanitizeMermaidChart(chart);

    async function renderDiagram() {
      const mermaid = (await import('mermaid')).default;
      const currentTheme = getMermaidTheme();

      mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme,
        securityLevel: 'loose',
        flowchart: { htmlLabels: true, curve: 'basis' },
      });

      try {
        // Unique id per render avoids "Duplicate id" when theme toggles
        const id = `mermaid-${renderId}-${Date.now()}`;
        const { svg } = await mermaid.render(id, safeChart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          if (containerRef.current) {
            containerRef.current.innerHTML = '';
          }
        }
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [mounted, chart, theme, renderId]);

  return (
    <div className="mermaid-wrapper" suppressHydrationWarning>
      {!mounted ? (
        <div className="mermaid mermaid-skeleton" aria-label="Loading diagram" />
      ) : error ? (
        <pre className="mermaid-error" role="alert">
          {`Diagram failed to render.\n${error}\n\n${chart}`}
        </pre>
      ) : (
        <div ref={containerRef} className="mermaid" />
      )}
    </div>
  );
}
