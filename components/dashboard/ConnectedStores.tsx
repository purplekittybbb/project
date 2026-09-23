"use client";

/**
 * Connected marketplace list + resync + disconnect confirm.
 * Status messages use fin-profit / fin-loss from lib/design/financial-ui.ts.
 */

import { useTranslation } from "react-i18next";
import { finLossClass, finProfitClass } from "@/lib/design/financial-ui";
import { getMarketplaceOption } from "@/lib/marketplaces";
import type { ServerCredentialConnection } from "@/lib/connect/store";

export type DisplayedConnection = {
  marketplaceId: string;
  provider: "live" | "demo";
  connectedAt: string | null;
};

export interface ConnectedStoresProps {
  authConfigured: boolean;
  displayedConnections: DisplayedConnection[];
  resyncableMarketplaces: string[];
  credentialMeta: Record<string, ServerCredentialConnection>;
  resyncBusy: string | null;
  resyncStatus: Record<string, { ok: boolean; message: string }>;
  disconnectStatus: Record<string, { ok: boolean; message: string }>;
  disconnectTarget: string | null;
  disconnectBusy: boolean;
  onDisconnectRequest: (marketplaceId: string) => void;
  onDisconnectCancel: () => void;
  onDisconnectConfirm: (deleteData: boolean) => void;
  onResync: (marketplace: string) => void;
}

export function ConnectedStores({
  authConfigured,
  displayedConnections,
  resyncableMarketplaces,
  credentialMeta,
  resyncBusy,
  resyncStatus,
  disconnectStatus,
  disconnectTarget,
  disconnectBusy,
  onDisconnectRequest,
  onDisconnectCancel,
  onDisconnectConfirm,
  onResync,
}: ConnectedStoresProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">
          {t("settings.connectedMarketplaces")}
        </div>
        {displayedConnections.length === 0 ? (
          <p className="text-zinc-600 font-mono text-[12px]">
            {t("settings.noMarketplaceConnected")}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {displayedConnections.map((c) => {
              const opt = getMarketplaceOption(c.marketplaceId);
              const isLive = c.provider === "live";
              const status = disconnectStatus[c.marketplaceId];
              return (
                <li
                  key={c.marketplaceId}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-200 text-sm truncate">
                        {opt?.label ?? c.marketplaceId}
                      </span>
                      <span
                        className={`shrink-0 text-[9px] px-1.5 py-0.5 font-mono uppercase tracking-widest border ${
                          isLive
                            ? "fin-border-profit-subtle fin-profit/80"
                            : "border-zinc-800 text-zinc-500"
                        }`}
                      >
                        {isLive ? t("settings.live") : t("settings.demo")}
                      </span>
                    </div>
                    <div className="text-zinc-600 text-[11px] font-mono mt-0.5 tabular-nums">
                      {c.connectedAt
                        ? t("settings.connectedOn", {
                            date: new Date(c.connectedAt).toISOString().slice(0, 10),
                          })
                        : t("settings.credentialsOnFile")}
                    </div>
                    {status && (
                      <div
                        className={
                          status.ok
                            ? finProfitClass("text-[11px] font-mono mt-1")
                            : finLossClass("text-[11px] font-mono mt-1")
                        }
                      >
                        {status.message}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDisconnectRequest(c.marketplaceId)}
                    className="shrink-0 inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-400 font-mono text-[12px] hover:border-[color-mix(in_srgb,var(--fin-loss)_40%,transparent)] hover:fin-loss transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                  >
                    {t("settings.disconnect")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {authConfigured && (
        <div className="mt-10 border border-zinc-900 bg-zinc-950/50 p-6">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">
            {t("settings.refreshData")}
          </div>
          {resyncableMarketplaces.length === 0 ? (
            <p className="text-zinc-600 font-mono text-[12px]">
              {t("settings.noLiveIntegration")}
            </p>
          ) : (
            <ul className="space-y-3">
              {resyncableMarketplaces.map((mp) => {
                const opt = getMarketplaceOption(mp);
                const status = resyncStatus[mp];
                const meta = credentialMeta[mp];
                const busy = resyncBusy === mp;
                const needsReauth = !!meta?.needsReauth;
                return (
                  <li key={mp} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-zinc-300 text-sm flex items-center gap-2">
                        <span>{opt?.label ?? mp}</span>
                        {needsReauth && (
                          <span className="text-amber-400 text-[10px] font-mono uppercase tracking-wider">
                            Yeniden bağlanmalı
                          </span>
                        )}
                      </div>
                      {status && (
                        <div
                          className={
                            status.ok
                              ? finProfitClass("text-[11px] font-mono mt-0.5")
                              : finLossClass("text-[11px] font-mono mt-0.5")
                          }
                        >
                          {status.message}
                        </div>
                      )}
                      {!status && meta?.lastSyncedAt && (
                        <div className="text-[11px] font-mono mt-0.5 text-zinc-600">
                          Son senkron: {new Date(meta.lastSyncedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {needsReauth && (
                        <a
                          href="/connect?preview=connect"
                          className="inline-flex items-center h-9 px-3 border border-amber-500/40 text-amber-300 font-mono text-[12px] hover:bg-amber-500/10 transition-colors"
                        >
                          Yeniden bağlan
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onResync(mp)}
                        disabled={busy}
                        className="inline-flex items-center h-9 px-4 border border-zinc-800 text-zinc-300 font-mono text-[12px] hover:bg-zinc-900 hover:text-zinc-100 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                      >
                        {busy ? t("common.refreshing") : t("common.refresh")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-zinc-600 font-mono leading-relaxed">
            {t("settings.refreshFootnote")}
          </p>
        </div>
      )}

      {disconnectTarget && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => !disconnectBusy && onDisconnectCancel()}
        >
          <div
            className="bg-zinc-950 border border-zinc-800 p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-zinc-100 text-sm font-medium mb-1.5">
              {t("settings.disconnectTitle", {
                marketplace:
                  getMarketplaceOption(disconnectTarget)?.label ?? disconnectTarget,
              })}
            </div>
            <p className="text-zinc-500 text-[12px] font-mono leading-relaxed mb-6">
              {t("settings.disconnectCopy")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onDisconnectConfirm(false)}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-10 px-4 border border-zinc-800 text-zinc-200 font-mono text-[12px] hover:bg-zinc-900 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              >
                {disconnectBusy ? t("common.working") : t("settings.disconnectOnly")}
              </button>
              <button
                type="button"
                onClick={() => onDisconnectConfirm(true)}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-10 px-4 fin-border-loss-subtle border fin-loss font-mono text-[12px] hover:bg-[color-mix(in_srgb,var(--fin-loss)_16%,transparent)] transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fin-loss)]"
              >
                {disconnectBusy ? t("common.working") : t("settings.disconnectAndDelete")}
              </button>
              <button
                type="button"
                onClick={onDisconnectCancel}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-9 px-4 text-zinc-500 font-mono text-[12px] hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
