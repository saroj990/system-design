'use client';

import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

type MermaidDiagramProps = {
  chart: string;
};

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, curve: 'basis' },
    });

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    ref.current.removeAttribute('data-processed');

    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        if (ref.current) ref.current.textContent = chart;
      });
  }, [chart]);

  return <div ref={ref} className="mermaid" />;
}
