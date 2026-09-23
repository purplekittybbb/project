"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * PDF §5.3 — zarif sayı güncellemesi (odometre / soft transition).
 * Tüm hücreyi flash etmek yerine sadece rakam yumuşak kayar.
 */
export function LiveNumber({
  value,
  format,
  className = "",
  style,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setBump(true);
    setDisplay(value);
    const t = window.setTimeout(() => setBump(false), 320);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <span className={`tnum tm-num-transition ${bump ? "tm-roll" : ""} ${className}`.trim()} style={style}>
      {format(display)}
    </span>
  );
}
