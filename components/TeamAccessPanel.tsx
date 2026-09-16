"use client";

/**
 * Ekip/rol bazlı çoklu kullanıcı erişimi — hesap sahibi e-posta ile
 * salt-okunur bir ekip üyesi davet edebilir; kabul eden kişi bu paneldeki
 * "Görüntüle" ile sahibin verisini salt-okunur olarak panelde görür.
 *
 * Gerçek veri erişimi RLS'e değil, app/api/team/data'nın service-role
 * tarafında yaptığı tenant_members üyelik kontrolüne dayanır (bkz. o
 * dosyanın ve migration 0036'nın yorumları).
 */

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";

interface Member {
  id: string;
  member_email: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

interface OwnedByOther {
  ownerId: string;
  label: string;
}

interface Props {
  authConfigured: boolean;
  viewingOwnerId: string | null;
  onViewOwner: (ownerId: string, label: string) => void;
  onStopViewing: () => void;
}

const STATUS_LABEL: Record<Member["status"], string> = {
  pending: "Bekliyor",
  accepted: "Kabul edildi",
  revoked: "İptal edildi",
};

export function TeamAccessPanel({ authConfigured, viewingOwnerId, onViewOwner, onStopViewing }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [owners, setOwners] = useState<OwnedByOther[]>([]);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [migrationPending, setMigrationPending] = useState(false);

  async function refresh() {
    const [membersRes, contextRes] = await Promise.all([
      fetch("/api/team/members").then((r) => r.json()).catch(() => ({ members: [] })),
      fetch("/api/team/context").then((r) => r.json()).catch(() => ({ owners: [] })),
    ]);
    setMembers(membersRes.members ?? []);
    setMigrationPending(Boolean(membersRes.migrationPending));
    setOwners(contextRes.owners ?? []);
  }

  useEffect(() => {
    if (!authConfigured) return;
    refresh();
  }, [authConfigured]);

  if (!authConfigured) return null;

  async function handleInvite() {
    if (!email.includes("@")) {
      setError("Geçerli bir e-posta girin.");
      return;
    }
    setInviting(true);
    setError("");
    const res = await fetch("/api/team/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setInviting(false);
    if (!res.ok) {
      setError(body.error ?? "Davet gönderilemedi.");
      return;
    }
    setEmail("");
    refresh();
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/team/members?id=${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">Ekip Erişimi</div>

      {migrationPending ? (
        <p className="text-zinc-600 font-mono text-[12px]">
          Bu özellik henüz etkinleştirilmedi (migration 0036 bekleniyor).
        </p>
      ) : (
        <>
          <p className="text-zinc-500 text-[12px] font-mono mb-4 max-w-md">
            E-posta ile davet ettiğiniz kişi, hesabınıza salt-okunur erişim kazanır — hiçbir veriyi
            değiştiremez veya silemez.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ekip@sirketiniz.com"
              className="w-56 bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-sm font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviting || !email}
              className="inline-flex items-center gap-1.5 h-8 px-3 bg-zinc-100 text-zinc-950 text-[12px] font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              <UserPlus size={12} />
              {inviting ? "Gönderiliyor…" : "Davet Et"}
            </button>
          </div>
          {error && <p className="fin-loss text-[11px] font-mono mb-3">{error}</p>}

          {members.length > 0 && (
            <ul className="divide-y divide-zinc-900 mb-2">
              {members
                .filter((m) => m.status !== "revoked")
                .map((m) => (
                  <li key={m.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-zinc-300 text-sm">{m.member_email}</span>
                      <span className="text-zinc-600 text-[11px] font-mono ml-2">{STATUS_LABEL[m.status]}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(m.id)}
                      className="text-zinc-600 hover:fin-loss transition-colors"
                      title="Erişimi iptal et"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {owners.length > 0 && (
        <div className="mt-6 pt-6 border-t border-zinc-900">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">
            Erişiminiz olan hesaplar
          </div>
          <ul className="space-y-2">
            {owners.map((o) => (
              <li key={o.ownerId} className="flex items-center justify-between gap-4">
                <span className="text-zinc-300 text-sm">{o.label}</span>
                {viewingOwnerId === o.ownerId ? (
                  <button
                    type="button"
                    onClick={onStopViewing}
                    className="h-7 px-3 border border-zinc-700 text-zinc-300 text-[12px] font-mono hover:border-zinc-500 transition-colors"
                  >
                    Kendi verime dön
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onViewOwner(o.ownerId, o.label)}
                    className="h-7 px-3 border border-zinc-800 text-zinc-400 text-[12px] font-mono hover:border-zinc-600 hover:text-zinc-200 transition-colors"
                  >
                    Görüntüle
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
