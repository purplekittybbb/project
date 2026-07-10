"use client";

/**
 * Kampanya Simülatörü
 *
 * Kullanıcı indirim oranı ve ek reklam harcaması girer;
 * computeTrueMargin motorundan geçirerek marjin canlı yeniden hesaplanır.
 * Kırılma noktası (break-even) geçildiğinde kırmızı uyarı gösterilir.
 */

import { useState, useMemo } from "react";
import {
  recomputeMarginWithDiscount,
  type CampaignResult,
  type Channel,
} from "@/lib/engine";

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(v: number, decimals = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function money(v: number, currency: string) {
  const sym = currency === "USD" ? "$" : "₺";
  return `${sym}${Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  danger?: boolean;
}

function Slider({ label, sub, value, min, max, step, unit, onChange, danger }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-zinc-300 text-[11px] font-sans uppercase tracking-[0.15em]">{label}</span>
          <span className="ml-2 text-zinc-600 text-[10px] font-mono">{sub}</span>
        </div>
        <span
          className={`font-mono tabular-nums text-sm font-semibold ${
            danger && value > 0 ? "text-red-400" : "text-zinc-100"
          }`}
        >
          {value}{unit}
        </span>
      </div>
      <div className="relative h-px bg-zinc-800">
        <div
          className={`absolute inset-y-0 left-0 ${danger && value > 0 ? "bg-red-500/60" : "bg-zinc-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-transparent appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-300 [&::-webkit-slider-thumb]:rounded-none -mt-1"
      />
    </div>
  );
}

interface MarginGaugeProps {
  label: string;
  value: number;
  dim?: boolean;
}

function MarginGauge({ label, value, dim }: MarginGaugeProps) {
  const positive = value >= 0;
  return (
    <div className={`p-5 border ${dim ? "border-zinc-900 bg-zinc-950/40" : "border-zinc-800 bg-zinc-900/60"}`}>
      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">{label}</div>
      <div
        className={`font-mono tabular-nums text-3xl font-semibold tracking-tight ${
          dim
            ? "text-zinc-500"
            : positive
            ? "text-emerald-400"
            : "text-red-400"
        }`}
      >
        {value.toFixed(1)}%
      </div>
      <div className="mt-2 h-px bg-zinc-900 w-full">
        <div
          className={`h-px ${positive ? "bg-emerald-500/50" : "bg-red-500/50"}`}
          style={{ width: `${clamp(Math.abs(value) * 3, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  tenantId: string;
  channel: Channel;
  currency: string;
}

export function CampaignSimulator({ tenantId, channel, currency }: Props) {
  const [discountPct, setDiscountPct] = useState(0);
  const [adBoostPct, setAdBoostPct]   = useState(0);

  const result: CampaignResult = useMemo(
    () => recomputeMarginWithDiscount(tenantId, discountPct, adBoostPct, channel),
    [tenantId, discountPct, adBoostPct, channel]
  );

  const isBelowZero   = result.campaignPct < 0;
  const isWorseThanBase = result.deltaPct < -0.5;
  const noChange      = discountPct === 0 && adBoostPct === 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="text-zinc-600 text-[11px] font-sans uppercase tracking-[0.2em] mb-1 border-l border-zinc-800 pl-4">
          Kampanya Simülatörü
        </h2>
        <p className="text-zinc-700 text-[11px] font-mono pl-4 border-l border-transparent">
          İndirim ve ek reklam gir — computeTrueMargin motoru canlı hesaplar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* ── Left: Controls ── */}
        <div className="space-y-8">
          <div className="border border-zinc-800 bg-zinc-900/20 p-6 space-y-8">
            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans border-b border-zinc-900 pb-4">
              Parametreler
            </div>

            <Slider
              label="İndirim Oranı"
              sub="fiyat indirimi"
              value={discountPct}
              min={0}
              max={50}
              step={1}
              unit="%"
              onChange={setDiscountPct}
              danger
            />

            <Slider
              label="Ek Reklam Harcaması"
              sub="mevcut bütçeye ek"
              value={adBoostPct}
              min={0}
              max={200}
              step={5}
              unit="%"
              onChange={setAdBoostPct}
              danger
            />

            {/* Reset */}
            {!noChange && (
              <button
                onClick={() => { setDiscountPct(0); setAdBoostPct(0); }}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors tracking-widest uppercase"
              >
                ↺ Sıfırla
              </button>
            )}
          </div>

          {/* Cost impact summary */}
          <div className="border border-zinc-900 p-5 space-y-3">
            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
              Kampanya Maliyeti
            </div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-zinc-500">Gelir kaybı</span>
              <span className="tabular-nums text-red-400">
                − {money(result.revenueLost, currency)}
              </span>
            </div>
            <div className="flex justify-between font-mono text-sm">
              <span className="text-zinc-500">Ek reklam</span>
              <span className="tabular-nums text-red-400">
                − {money(result.extraAdSpend, currency)}
              </span>
            </div>
            <div className="border-t border-zinc-900 pt-3 flex justify-between font-mono text-sm font-semibold">
              <span className="text-zinc-400">Net katkı</span>
              <span className={`tabular-nums ${result.netContribution >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {money(result.netContribution, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: Margin comparison ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800">
            <MarginGauge label="Mevcut Marj" value={result.basePct} dim />
            <MarginGauge label="Kampanya Marjı" value={result.campaignPct} />
          </div>

          {/* Delta pill */}
          <div
            className={`flex items-center justify-between border px-5 py-3 font-mono text-sm ${
              isWorseThanBase
                ? "border-red-900/50 bg-red-950/20"
                : "border-zinc-800 bg-zinc-900/20"
            }`}
          >
            <span className="text-zinc-500 text-[11px] uppercase tracking-widest">Fark</span>
            <span
              className={`tabular-nums text-lg font-semibold ${
                result.deltaPct >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pct(result.deltaPct)} puan
            </span>
          </div>

          {/* Break-even alert */}
          {isBelowZero && (
            <div className="border border-red-900/60 bg-red-950/20 px-5 py-4 font-mono">
              <div className="text-red-400 text-[10px] uppercase tracking-[0.2em] mb-1">
                ⚠ Kırılma Noktası Aşıldı
              </div>
              <div className="text-red-500/80 text-[11px]">
                Bu kampanya koşullarında satış başına zarar ediliyor.
                İndirim oranını düşür veya reklam bütçesini kıs.
              </div>
            </div>
          )}

          {/* Qualitative verdict */}
          {!noChange && !isBelowZero && (
            <div
              className={`border px-5 py-3 font-mono text-[11px] ${
                isWorseThanBase
                  ? "border-zinc-800 text-zinc-500"
                  : "border-emerald-900/40 text-emerald-600"
              }`}
            >
              {isWorseThanBase
                ? `Marj ${Math.abs(result.deltaPct).toFixed(1)} puan düştü — hacim artışı telafi etmeli.`
                : "Kampanya mevcut marjı koruyabilir."}
            </div>
          )}

          {/* Indirimli gelir */}
          <div className="border border-zinc-900 px-5 py-3">
            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.15em] font-sans mb-1">
              İndirimli Brüt Gelir
            </div>
            <div className="font-mono tabular-nums text-zinc-200 text-lg">
              {money(result.discountedRevenue, currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Engine trace footnote */}
      <div className="border-t border-zinc-900 pt-4 font-mono text-[10px] text-zinc-700">
        Motor: <span className="text-zinc-600">recomputeMarginWithDiscount</span>
        {" → "}
        <span className="text-zinc-600">aggregateTrueMargin</span>
        {" — grossRevenue × (1−indirim); komisyon/KDV/ödeme bedeli birlikte ölçeklenir; COGS+kargo+iadeler sabit."}
      </div>
    </div>
  );
}
