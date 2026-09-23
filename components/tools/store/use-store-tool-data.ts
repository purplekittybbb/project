"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildUserSeller,
  loadUserRowsWithStatus,
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
  | { status: "no-data"; connectHref: string; message?: string }
  | { status: "load-error"; message: string }
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

      const connectHref = buildConnectUrl(toolHref);
      const { rows, error: loadError } = await loadUserRowsWithStatus();
      if (loadError) {
        if (!cancelled) {
          setState({
            status: "load-error",
            message: "Satış verileri yüklenemedi. Oturumu yenileyip tekrar deneyin.",
          });
        }
        return;
      }

      if (rows.length === 0) {
        const credRes = await fetch("/api/marketplace/credentials-status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!credRes.ok) {
          if (!cancelled) {
            setState({
              status: "load-error",
              message: "Mağaza bağlantı durumu okunamadı. Oturumu yenileyip tekrar deneyin.",
            });
          }
          return;
        }
        const credJson = (await credRes.json()) as { connections?: unknown[]; marketplaces?: string[] };
        const hasCredentials =
          (credJson.connections?.length ?? 0) > 0 || (credJson.marketplaces?.length ?? 0) > 0;

        if (!cancelled) {
          setState(
            hasCredentials
              ? {
                  status: "no-data",
                  connectHref,
                  message: "Mağaza bağlı ancak henüz sipariş verisi yok — senkron bekleyin veya CSV yükleyin.",
                }
              : { status: "no-store", connectHref },
          );
        }
        return;
      }

      const seller = buildUserSeller(rows, USER_TENANT_ID);
      if (!seller) {
        if (!cancelled) {
          setState({
            status: "no-data",
            connectHref,
            message: "Kayıtlı satırlar işlenemedi — CSV formatını veya manuel girişleri kontrol edin.",
          });
        }
        return;
      }

      registerRuntimeSeller(seller, "Mağazam");
      const view = buildSellerView(seller, "combined");
      if (!view) {
        if (!cancelled) {
          setState({
            status: "no-data",
            connectHref,
            message: "Veriler yüklendi ancak marj hesaplanamadı — satır alanlarını kontrol edin.",
          });
        }
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
  }, [state.status, router, toolHref]);

  return state;
}
