'use client'

import { useEffect, useState } from "react";

type Step = {
  label: string[];
  low: number;
  high: number;
  tag: string;
  kind: "start" | "loss" | "result";
};

const DATA: Step[] = [
  { label: ["Reported"], low: 0, high: 24, tag: "24%", kind: "start" },
  { label: ["Commission"], low: 17, high: 24, tag: "\u22127", kind: "loss" },
  { label: ["VAT"], low: 13, high: 17, tag: "\u22124", kind: "loss" },
  { label: ["Shipping"], low: 10, high: 13, tag: "\u22123", kind: "loss" },
  { label: ["Returns"], low: 8, high: 10, tag: "\u22122", kind: "loss" },
  { label: ["Ad", "spend"], low: 4, high: 8, tag: "\u22124", kind: "loss" },
  { label: ["True", "margin"], low: 0, high: 4, tag: "4%", kind: "result" },
];

const C = {
  bg: "#0B1F17",
  start: "#93A69C",
  loss: "#F08A82",
  result: "#4FD08A",
  startLabel: "#FFFFFF",
  lossLabel: "#F6ADA6",
  resultLabel: "#7CE0AE",
  axis: "rgba(255,255,255,0.42)",
  cat: "rgba(255,255,255,0.60)",
  baseline: "rgba(255,255,255,0.18)",
  connector: "rgba(255,255,255,0.16)",
  mono:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  sans:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export default function MarginWaterfall() {
  const W = 540;
  const H = 340;
  const padL = 38;
  const padR = 14;
  const padT = 34;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yMax = 26;

  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  const n = DATA.length;
  const slot = plotW / n;
  const barW = Math.min(38, slot * 0.6);
  const x = (i: number) => padL + slot * i + (slot - barW) / 2;

  const ticks = [0, 8, 16, 24];

  const [shown, setShown] = useState(false);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(true);
      return;
    }
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const fill = (k: Step["kind"]) =>
    k === "start" ? C.start : k === "loss" ? C.loss : C.result;
  const labelColor = (k: Step["kind"]) =>
    k === "start" ? C.startLabel : k === "loss" ? C.lossLabel : C.resultLabel;

  return (
    <div
      style={{
        background: C.bg,
        borderRadius: 16,
        padding: "22px 22px 16px",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: C.sans,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
          Sample seller &middot; margin per SKU
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(255,255,255,0.78)",
            background: "rgba(255,255,255,0.08)",
            padding: "1px 7px",
            borderRadius: 5,
            letterSpacing: "0.02em",
          }}
        >
          illustrative
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.7)",
            fontFamily: C.mono,
          }}
        >
          24% reported
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>&rarr;</span>
        <span
          style={{
            fontSize: 21,
            fontWeight: 600,
            color: "#FFFFFF",
            fontFamily: C.mono,
          }}
        >
          4% true
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#F6ADA6",
            background: "rgba(240,138,130,0.14)",
            padding: "2px 8px",
            borderRadius: 6,
            fontFamily: C.mono,
          }}
        >
          &minus;20 pts hidden
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Waterfall chart: reported margin 24 percent falls to a true margin of 4 percent after commission, VAT, shipping, returns and ad spend are deducted."
        style={{
          display: "block",
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        {ticks.map((t) => (
          <text
            key={t}
            x={padL - 8}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize={11}
            fontFamily={C.mono}
            fill={C.axis}
          >
            {t}%
          </text>
        ))}

        <line
          x1={padL}
          y1={y(0)}
          x2={W - padR}
          y2={y(0)}
          stroke={C.baseline}
          strokeWidth={1}
        />

        {DATA.map((s, i) => {
          if (i === 0 || s.kind === "result") return null;
          const prev = DATA[i - 1];
          const cy = y(s.high);
          const x1 = x(i - 1) + barW;
          const x2 = x(i);
          return (
            <line
              key={`c${i}`}
              x1={x1}
              y1={y(prev.low)}
              x2={x2}
              y2={cy}
              stroke={C.connector}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          );
        })}

        {DATA.map((s, i) => {
          const top = y(s.high);
          const bottom = y(s.low);
          const h = Math.max(2, bottom - top);
          return (
            <g key={i}>
              <rect
                x={x(i)}
                y={top}
                width={barW}
                height={h}
                rx={3}
                fill={fill(s.kind)}
              />
              <text
                x={x(i) + barW / 2}
                y={top - 8}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fontFamily={C.mono}
                fill={labelColor(s.kind)}
              >
                {s.tag}
              </text>
              {s.label.map((line, li) => (
                <text
                  key={li}
                  x={x(i) + barW / 2}
                  y={H - padB + 18 + li * 13}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily={C.sans}
                  fill={C.cat}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
