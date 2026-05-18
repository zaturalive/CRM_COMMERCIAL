"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface LineChartProps {
  data: Array<{ label: string; value: number }>;
  /** Valeurs en centimes, axe Y formate en euros. */
  height?: number;
}

/**
 * EP08-S01 — Line chart SVG minimaliste.
 * Dessine une polyline + axes X (labels) + hover tooltip. Pas de lib, tout
 * en svg natif — suffit pour un MVP avec <= 30 points.
 */
export function LineChart({ data, height = 220 }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const { points, maxV, padding, innerWidth, innerHeight } = useMemo(() => {
    const padding = { top: 16, right: 16, bottom: 28, left: 48 };
    const width = 600;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxV = Math.max(1, ...data.map((d) => d.value));
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;
    const points = data.map((d, i) => ({
      x: padding.left + i * step,
      y: padding.top + innerHeight - (d.value / maxV) * innerHeight,
      label: d.label,
      value: d.value,
    }));
    return { points, maxV, padding, innerWidth, innerHeight };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-text-secondary">
        Aucune donnee
      </div>
    );
  }

  const width = 600;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L${points[points.length - 1].x},${padding.top + innerHeight} L${points[0].x},${padding.top + innerHeight} Z`;

  // 4 ticks Y
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padding.top + innerHeight - t * innerHeight,
    v: Math.round(t * maxV),
  }));

  // Labels X : affiche un sous-ensemble si trop dense
  const labelStep = data.length > 14 ? Math.ceil(data.length / 7) : 1;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid + Y ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={t.y}
              y2={t.y}
              stroke="#E5E7EB"
              strokeDasharray="3 3"
            />
            <text
              x={padding.left - 8}
              y={t.y + 3}
              fontSize="10"
              textAnchor="end"
              fill="#6B7280"
              fontFamily="ui-monospace, monospace"
            >
              {formatShortEuros(t.v)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#caGradient)" opacity={0.3} />
        <defs>
          <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6C63FF" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Line */}
        <path d={pathD} stroke="#6C63FF" strokeWidth="2" fill="none" />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 3}
              fill="#6C63FF"
              stroke="white"
              strokeWidth="1.5"
              style={{ transition: "r 0.15s" }}
            />
            <rect
              x={p.x - 15}
              y={padding.top}
              width={30}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
          </g>
        ))}

        {/* X labels */}
        {points.map((p, i) =>
          i % labelStep === 0 || i === points.length - 1 ? (
            <text
              key={`x-${i}`}
              x={p.x}
              y={height - padding.bottom + 16}
              fontSize="10"
              textAnchor="middle"
              fill="#6B7280"
              fontFamily="ui-monospace, monospace"
            >
              {p.label}
            </text>
          ) : null
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow"
          style={{
            left: `${(points[hover].x / width) * 100}%`,
            top: `${(points[hover].y / height) * 100}%`,
            transform: "translate(-50%, -110%)",
          }}
        >
          <div className="font-mono">{points[hover].label}</div>
          <div className="font-mono font-semibold">
            {formatCurrency(points[hover].value)}
          </div>
        </div>
      )}
    </div>
  );
}

function formatShortEuros(centimes: number): string {
  const euros = centimes / 100;
  if (euros >= 1000) return `${Math.round(euros / 100) / 10}k€`;
  return `${Math.round(euros)}€`;
}
