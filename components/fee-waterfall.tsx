"use client";

/**
 * Fee waterfall — the signature "instrument".
 *
 * Same visual language as the landing's MarginWaterfall (dark card, coral losses,
 * green result, mono figures, value on every bar) but driven LIVE by the engine
 * (lib/engine) for the selected seller, and negative-aware so a silent-loser seller
 * whose true margin is below zero renders correctly (bars cross the baseline).
 */

export type WaterfallStep = {
  label: string[];
  low: number;
  high: number;
  kind: "start" | "loss" | "result";
  tag: string;
};

const C = {
  bg: "#0B1F17",
  start: "#93A69C",
  loss: "#F08A82",
  result: "#4FD08A",
  resultNeg: "#F08A82",
  startLabel: "#FFFFFF",
  lossLabel: "#F6ADA6",
  resultLabel: "#7CE0AE",
  axis: "rgba(255,255,255,0.42)",
  cat: "rgba(255,255,255,0.60)",
  baseline: "rgba(255,255,255,0.28)",
  connector: "rgba(255,255,255,0.16)",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};

function niceTicks(min: number, max: number): number[] {
  const lo = Math.floor(min / 10) * 10;
  const hi = Math.ceil(max / 10) * 10;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);
  return ticks;
}

export function FeeWaterfall({
  steps,
  caption,
  perceivedPct,
  truePct,
  hiddenPts,
}: {
  steps: WaterfallStep[];
  caption: string;
  perceivedPct: number;
  truePct: number;
  hiddenPts: number;
}) {
  const W = 560;
  const H = 340;
  const padL = 40;
  const padR = 14;
  const padT = 34;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = steps.flatMap((s) => [s.low, s.high]).concat(0);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const ticks = niceTicks(dataMin, dataMax);
  const yMax = ticks[ticks.length - 1];
  const yMin = ticks[0];
  const y = (v: number) => padT + plotH * ((yMax - v) / (yMax - yMin));

  const n = steps.length;
  const slot = plotW / n;
  const barW = Math.min(40, slot * 0.6);
  const x = (i: number) => padL + slot * i + (slot - barW) / 2;

  const fill = (s: WaterfallStep) =>
    s.kind === "start" ? C.start : s.kind === "loss" ? C.loss : s.high <= 0 ? C.resultNeg : C.result;
  const labelColor = (s: WaterfallStep) =>
    s.kind === "start" ? C.startLabel : s.kind === "loss" ? C.lossLabel : s.high <= 0 ? C.lossLabel : C.resultLabel;

  const trueNeg = truePct < 0;

  return (
    <div
      style={{
        background: C.bg,
        borderRadius: 16,
        padding: "22px 22px 16px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 10 }}>{caption}</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: C.mono }}>
          {perceivedPct.toFixed(1)}% perceived
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>&rarr;</span>
        <span style={{ fontSize: 21, fontWeight: 600, color: trueNeg ? "#F6ADA6" : "#FFFFFF", fontFamily: C.mono }}>
          {truePct.toFixed(1)}% true
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
          &minus;{hiddenPts.toFixed(1)} pts hidden
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Fee waterfall: perceived margin ${perceivedPct.toFixed(
          1
        )} percent falls to a true margin of ${truePct.toFixed(1)} percent after VAT, shipping, returns, ad spend and payment fees are deducted.`}
        style={{ display: "block" }}
      >
        {ticks.map((t) => (
          <text key={t} x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={11} fontFamily={C.mono} fill={C.axis}>
            {t}%
          </text>
        ))}

        {/* zero baseline */}
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke={C.baseline} strokeWidth={1} />

        {/* dashed connectors between steps */}
        {steps.map((s, i) => {
          if (i === 0) return null;
          const prev = steps[i - 1];
          return (
            <line
              key={`c${i}`}
              x1={x(i - 1) + barW}
              y1={y(prev.low)}
              x2={x(i)}
              y2={y(s.high)}
              stroke={C.connector}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          );
        })}

        {steps.map((s, i) => {
          const top = y(s.high);
          const bottom = y(s.low);
          const h = Math.max(2, bottom - top);
          const tagAbove = s.high > 0;
          return (
            <g key={i}>
              <rect x={x(i)} y={top} width={barW} height={h} rx={3} fill={fill(s)} />
              <text
                x={x(i) + barW / 2}
                y={tagAbove ? top - 8 : bottom + 15}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fontFamily={C.mono}
                fill={labelColor(s)}
              >
                {s.tag}
              </text>
              {s.label.map((line, li) => (
                <text
                  key={li}
                  x={x(i) + barW / 2}
                  y={H - padB + 20 + li * 13}
                  textAnchor="middle"
                  fontSize={11}
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
