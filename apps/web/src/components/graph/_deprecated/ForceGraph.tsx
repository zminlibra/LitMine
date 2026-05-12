"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import cytoscape, { Core, EventObject } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import type { GraphNode, GraphEdge } from "@/types";

cytoscape.use(coseBilkent);

const CLUSTER_COLORS = [
  "#047857", "#059669", "#10b981", "#34d399", "#6ee7b7",
  "#a7f3d0", "#064e3b", "#065f46", "#047857",
];

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (paperId: string) => void;
}

export default function ForceGraph({ nodes, edges, onNodeClick, onNodeDoubleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const buildElements = useCallback(() => {
    // Assign cluster IDs based on keyword association
    const paperNodes = nodes.filter((n) => n.type === "paper");
    const keywordNodes = nodes.filter((n) => n.type === "keyword");

    // Build paper → keyword map for clustering
    const paperKeywords: Record<string, string[]> = {};
    for (const edge of edges) {
      if (edge.type === "RELATES_TO") {
        if (!paperKeywords[edge.source]) paperKeywords[edge.source] = [];
        paperKeywords[edge.source].push(edge.target);
        if (!paperKeywords[edge.target]) paperKeywords[edge.target] = [];
        paperKeywords[edge.target].push(edge.source);
      }
    }

    // Map keyword to cluster index
    const keywordToCluster: Record<string, number> = {};
    keywordNodes.forEach((kw, i) => {
      keywordToCluster[kw.id] = i % CLUSTER_COLORS.length;
    });

    const elements: cytoscape.ElementDefinition[] = [];

    // Paper nodes
    for (const node of paperNodes) {
      // Find associated keywords to assign cluster color
      let clusterIdx = 0;
      const related = paperKeywords[node.id] || [];
      if (related.length > 0) {
        // Pick the first keyword's cluster
        const kwId = related.find((id) => keywordToCluster[id] !== undefined);
        if (kwId) clusterIdx = keywordToCluster[kwId];
      }

      const title = (node.properties?.title as string) || node.label || "";
      const authors = (node.properties?.authors as string[]) || [];
      const year = node.properties?.year as number || "";
      const authorStr = Array.isArray(authors) ? authors.join(", ") : "";

      elements.push({
        data: {
          id: node.id,
          label: title.slice(0, 40),
          type: "paper",
          color: CLUSTER_COLORS[clusterIdx],
          fullTitle: title,
          authors: authorStr,
          year: String(year),
        },
      });
    }

    // Keyword nodes
    for (const node of keywordNodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.label,
          type: "keyword",
          color: "#8b5cf6",
        },
      });
    }

    // Edges
    for (const edge of edges) {
      const isSimilarity = edge.type === "SIMILAR_TO";
      const score = (edge.properties?.similarity_score as number) || 0.3;
      elements.push({
        data: {
          id: `${edge.source}-${edge.target}-${edge.type}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          weight: isSimilarity ? score : 0.5,
        },
      });
    }

    return elements;
  }, [nodes, edges]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (nodes.length === 0) return;

    const elements = buildElements();

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: ([
        // Paper nodes
        {
          selector: 'node[type="paper"]',
          style: {
            "background-color": "data(color)",
            "width": "mapData(degree, 0, 30, 18, 42)",
            "height": "mapData(degree, 0, 30, 18, 42)",
            "label": "data(label)",
            "font-size": "10px",
            "color": "#3f3f46",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 6,
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "border-width": 1,
            "border-color": "data(color)",
            "border-opacity": 0.3,
            "transition-property": "width, height, border-width, border-opacity",
            "transition-duration": 200,
          },
        },
        // Keyword nodes (small diamonds)
        {
          selector: 'node[type="keyword"]',
          style: {
            "background-color": "#d4c4fc",
            "shape": "diamond",
            "width": 12,
            "height": 12,
            "label": "data(label)",
            "font-size": "8px",
            "color": "#7c3aed",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
          },
        },
        // SIMILAR_TO edges
        {
          selector: 'edge[type="SIMILAR_TO"]',
          style: {
            "width": 1,
            "line-color": "#d1d5db",
            "line-opacity": "data(weight)",
            "curve-style": "bezier",
          },
        },
        // RELATES_TO edges
        {
          selector: 'edge[type="RELATES_TO"]',
          style: {
            "width": 0.6,
            "line-color": "#e5e7eb",
            "line-opacity": 0.5,
            "target-arrow-color": "#d1d5db",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.5,
            "curve-style": "bezier",
          },
        },
        // Hover highlight
        {
          selector: "node:active",
          style: {
            "border-width": 2,
            "border-color": "#059669",
            "border-opacity": 0.8,
          },
        },
      ] as cytoscape.StylesheetStyle[]),
      layout: {
        name: "cose-bilkent",
        nodeRepulsion: 4500,
        idealEdgeLength: 80,
        gravity: 0.25,
        numIter: 2500,
        animate: true,
        animationDuration: 800,
      } as cytoscape.LayoutOptions,
      zoomingEnabled: true,
      userZoomingEnabled: true,
      panningEnabled: true,
      userPanningEnabled: true,
      autoungrabify: false,
      autounselectify: false,
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 3,
    });

    cyRef.current = cy;

    // Hover: highlight neighbors, show tooltip
    const onMouseOver = (evt: EventObject) => {
      const node = evt.target;
      if (!node.isNode()) return;

      const nodeData = node.data();
      if (nodeData.type === "paper") {
        // Dim all nodes except this one and its neighbors
        const neighbors = node.closedNeighborhood();
        cy.elements().difference(neighbors).style({
          "opacity": 0.2,
          "transition-property": "opacity",
          "transition-duration": 200,
        });
        neighbors.style({
          "opacity": 1,
        });

        // Show tooltip
        const pos = node.renderedPosition();
        const tooltipText = `${nodeData.fullTitle}\n${nodeData.authors}${nodeData.year ? ` (${nodeData.year})` : ""}`;
        setTooltip({ x: pos.x + 15, y: pos.y - 10, text: tooltipText });
      }
    };

    const onMouseOut = (evt: EventObject) => {
      const node = evt.target;
      if (!node.isNode()) return;
      cy.elements().style({
        "opacity": 1,
      });
      setTooltip(null);
    };

    // Click: select paper → open sidebar
    cy.on("tap", "node", (evt: EventObject) => {
      const node = evt.target;
      const nodeData = node.data();
      if (nodeData.type === "paper") {
        onNodeClick(nodeData.id);
      }
    });

    // Double click: navigate to paper detail
    cy.on("dbltap", "node", (evt: EventObject) => {
      const node = evt.target;
      const nodeData = node.data();
      if (nodeData.type === "paper") {
        onNodeDoubleClick(nodeData.id);
      }
    });

    cy.on("mouseover", "node", onMouseOver);
    cy.on("mouseout", "node", onMouseOut);

    // Click background to deselect
    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        onNodeClick("");
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, buildElements, onNodeClick, onNodeDoubleClick]);

  const handleZoomIn = () => {
    cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  };

  const handleZoomOut = () => {
    cyRef.current?.zoom(cyRef.current.zoom() * 0.7);
  };

  const handleFit = () => {
    cyRef.current?.fit(undefined, 50);
  };

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        No papers in this project yet.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs max-w-[260px] pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-medium text-zinc-800 mb-0.5 line-clamp-3">{tooltip.text.split("\n")[0]}</p>
          <p className="text-zinc-500 line-clamp-2">{tooltip.text.split("\n").slice(1).join(" ")}</p>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 text-zinc-600 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 text-zinc-600 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={handleFit}
          className="p-2 bg-white border border-zinc-200 rounded-lg shadow-sm hover:bg-zinc-50 text-zinc-600 transition-colors"
          title="Fit to screen"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
