"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildUserSeller,
  loadUserRows,
  USER_TENANT_ID,
  type StoredRow,
} from "@/lib/supabase/user-data";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import {
  buildSellerView,
  registerRuntimeSeller,
  type SellerView,
} from "@/lib/engine";
import { buildSkuEconomicsMap, type SkuEconomics } from "@/lib/tools/sku-economics";
import { loadDemandEstimates, type StoredDemandEstimate } from "@/lib/supabase/demand-estimates";
import { buildConnectUrl } from "@/lib/tools/store-gate";

export type StoreToolState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "no-store"; connectHref: string }
  | { status: "no-data"; connectHref: string }
  | {
      status: "ready";
      view: SellerView;
      rows: StoredRow[];
      skuEconomics: Map<string, SkuEconomics>;
      demandEstimates: StoredDemandEstimate[];
    };

export function useStoreToolData(toolHref: string): StoreToolState {
  const router = useRouter();
  const [state, setState] = useState<StoreToolState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isAuthConfigured()) {
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) setState({ status: "anonymous" });
        return;
      }

      const credRes = await fetch("/api/marketplace/credentials-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const credJson = (await credRes.json()) as { connections?: unknown[]; marketplaces?: string[] };
      const hasStore =
        (credJson.connections?.length ?? 0) > 0 || (credJson.marketplaces?.length ?? 0) > 0;

      if (!hasStore) {
        if (!cancelled) setState({ status: "no-store", connectHref: buildConnectUrl(toolHref) });
        return;
      }

      const rows = await loadUserRows();
      if (rows.length === 0) {
        if (!cancelled) setState({ status: "no-data", connectHref: buildConnectUrl(toolHref) });
        return;
      }

      const seller = buildUserSeller(rows, USER_TENANT_ID);
      if (!seller) {
        if (!cancelled) setState({ status: "no-data", connectHref: buildConnectUrl(toolHref) });
        return;
      }

      registerRuntimeSeller(seller, "Mağazam");
      const view = buildSellerView(seller, "combined");
      if (!view) {
        if (!cancelled) setState({ status: "no-data", connectHref: buildConnectUrl(toolHref) });
        return;
      }

      const demandEstimates = await loadDemandEstimates();

      if (!cancelled) {
        setState({
          status: "ready",
          view,
          rows,
          skuEconomics: buildSkuEconomicsMap(rows),
          demandEstimates,
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [toolHref]);

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(toolHref)}`);
    }
  }, [state, router, toolHref]);

  return state;
}
