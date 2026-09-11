"use client";

import type { StoreToolId, ToolDefinition } from "@/lib/tools/registry";
import { StoreToolShell } from "@/components/tools/store/store-tool-shell";
import { NetKarStorePage } from "@/components/tools/store/net-kar-page";
import { LossAlarmStorePage } from "@/components/tools/store/loss-alarm-page";
import { SafePriceStorePage } from "@/components/tools/store/safe-price-page";
import { DemandStorePage } from "@/components/tools/store/demand-page";
import { ListQualityStorePage } from "@/components/tools/store/list-quality-page";
import { BarcodeStorePage } from "@/components/tools/store/barcode-page";

export function StoreToolRouter({ tool }: { tool: ToolDefinition }) {
  const id = tool.id as StoreToolId;

  return (
    <StoreToolShell tool={tool}>
      {(data, { refresh }) => {
        switch (id) {
          case "profit":
            return <NetKarStorePage data={data} />;
          case "loss-alarm":
            return <LossAlarmStorePage data={data} />;
          case "safe-price":
            return <SafePriceStorePage data={data} />;
          case "demand":
            return <DemandStorePage data={data} />;
          case "list-quality":
            return <ListQualityStorePage data={data} />;
          case "barcode-analysis":
            return <BarcodeStorePage data={data} onRefresh={refresh} />;
          default:
            return null;
        }
      }}
    </StoreToolShell>
  );
}
