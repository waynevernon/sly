import { Component, useMemo } from "react";
import type { ReactNode } from "react";
import DOMPurify from "dompurify";
import { renderMermaidSVG } from "beautiful-mermaid";

class MermaidErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-xs text-text-muted italic px-2 pt-6 pb-3 text-center">
          Mermaid diagram could not be rendered
        </div>
      );
    }
    return this.props.children;
  }
}

interface MermaidRendererProps {
  code: string;
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const { svg, error } = useMemo(() => {
    if (!code.trim()) return { svg: null, error: null };
    try {
      const raw = renderMermaidSVG(code.trim(), {
        bg: "var(--color-bg)",
        fg: "var(--color-text)",
        muted: "var(--color-text-muted)",
        border: "var(--color-border-solid)",
        transparent: true,
      });
      return {
        svg: DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } }),
        error: null,
      };
    } catch (err) {
      return {
        svg: null,
        error: err instanceof Error ? err.message : "Invalid mermaid syntax",
      };
    }
  }, [code]);

  if (error) {
    return (
      <div className="text-xs text-text-muted italic px-2 pt-6 pb-3 text-center">
        Mermaid syntax error
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="text-xs text-text-muted italic px-2 pt-6 pb-3 text-center">
        Empty mermaid diagram
      </div>
    );
  }

  return (
    <MermaidErrorBoundary>
      <div
        className="mermaid-diagram flex justify-center py-2"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </MermaidErrorBoundary>
  );
}
