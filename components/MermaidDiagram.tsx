'use client';

import { useEffect, useId, useRef, useState } from 'react';

type MermaidDiagramProps = {
  chart: string;
};

function getMermaidTheme(): 'neutral' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral';
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = useId().replace(/:/g, '');
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<'neutral' | 'dark'>('neutral');

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
        const { svg } = await mermaid.render(`mermaid-${renderId}`, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = chart;
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
      ) : (
        <div ref={containerRef} className="mermaid" />
      )}
    </div>
  );
}
