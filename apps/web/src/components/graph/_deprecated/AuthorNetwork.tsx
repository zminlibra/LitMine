"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import type { InfluentialAuthor } from "@/types";

cytoscape.use(coseBilkent);

interface Collaboration {
  source: string;
  target: string;
  co_authored_papers: number;
}

interface AuthorNetworkProps {
  authors: InfluentialAuthor[];
  collaborations: Collaboration[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  paperCount: number;
}

export default function AuthorNetwork({ authors, collaborations }: AuthorNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    label: "",
    paperCount: 0,
  });

  const showTooltip = useCallback(
    (label: string, citationCount: number, event: EventObject) => {
      const { x, y } = event.renderedPosition ?? { x: 0, y: 0 };
      setTooltip({
        visible: true,
        x,
        y,
        label,
        paperCount: citationCount,
      });
    },
    [],
  );

  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (authors.length === 0) return;

    const authorSet = new Set(authors.map((a) => a.name));

    const nodes = authors.map((author) => ({
      data: {
        id: author.name,
        label: author.name,
        type: "author",
        citation_count: author.citation_count,
      },
    }));

    const edges = collaborations
      .filter((c) => authorSet.has(c.source) && authorSet.has(c.target))
      .map((collab) => ({
        data: {
          id: `${collab.source}|||${collab.target}`,
          source: collab.source,
          target: collab.target,
          type: "COLLABORATED_WITH",
          co_authored_papers: collab.co_authored_papers,
        },
      }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      style: ([
        {
          selector: "node[type='author']",
          style: {
            "background-color": "#059669",
            "border-color": "#047857",
            "border-width": 1,
            shape: "ellipse",
            width: (ele: cytoscape.NodeSingular) =>
              Math.max(15, Math.min(50, (ele.data("citation_count") as number) * 3)),
            height: (ele: cytoscape.NodeSingular) =>
              Math.max(15, Math.min(50, (ele.data("citation_count") as number) * 3)),
            label: "data(label)",
            "font-size": "10px",
            color: "#ffffff",
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#059669",
            "text-outline-width": 1,
          },
        },
        {
          selector: "edge[type='COLLABORATED_WITH']",
          style: {
            "line-color": "#a7f3d0",
            "target-arrow-color": "#a7f3d0",
            "target-arrow-shape": "none",
            width: (ele: cytoscape.EdgeSingular) =>
              Math.max(1, Math.min(6, (ele.data("co_authored_papers") as number) * 0.8)),
            "curve-style": "bezier",
          },
        },
      ] as cytoscape.StylesheetStyle[]),
      layout: {
        name: "cose-bilkent",
        nodeRepulsion: 2000,
        idealEdgeLength: 50,
        animate: true,
      } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 3,
    });

    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      showTooltip(
        node.data("label") as string,
        node.data("citation_count") as number,
        event,
      );
    });

    cy.on("mouseout", "node", () => {
      hideTooltip();
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;
      showTooltip(
        node.data("label") as string,
        node.data("citation_count") as number,
        event,
      );
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [authors, collaborations, showTooltip, hideTooltip]);

  const containerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  };

  const tooltipStyle: CSSProperties = {
    position: "absolute",
    left: tooltip.x + 12,
    top: tooltip.y - 40,
    visibility: tooltip.visible ? "visible" : "hidden",
    pointerEvents: "none",
    zIndex: 50,
    background: "rgba(0, 0, 0, 0.85)",
    color: "#ffffff",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
  };

  return (
    <div style={containerStyle}>
      {authors.length === 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          No author collaboration data available
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              inset: 0,
            }}
          />
          <div style={tooltipStyle}>
            <div style={{ fontWeight: 600 }}>{tooltip.label}</div>
            <div style={{ color: "#d1d5db" }}>
              {tooltip.paperCount} paper{tooltip.paperCount !== 1 ? "s" : ""}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
