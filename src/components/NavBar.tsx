"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Bell, X, ChevronDown, KeyRound, LogOut, Search, User } from "lucide-react";

type NavItem = { label: string; href: string; badge?: boolean; children?: { label: string; href: string }[] }

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Prospection", href: "/prospection" },
  { label: "Vente", href: "/pipeline", children: [
    { label: "Pipeline", href: "/pipeline" },
    { label: "Deals", href: "/opportunities" },
    { label: "Comptes", href: "/accounts" },
  ]},
  { label: "Logistique", href: "/supply", children: [
    { label: "Supply", href: "/supply" },
    { label: "Fournisseurs", href: "/supply/fournisseurs" },
  ]},
  { label: "Projets", href: "/projects", children: [
    { label: "Prescription", href: "/projects?tab=prescription" },
    { label: "Déploiement", href: "/projects?tab=deploiement" },
  ]},
  { label: "Finance", href: "/invoices", children: [
    { label: "Facturation", href: "/invoices" },
    { label: "Notes de frais", href: "/expenses" },
  ]},
  { label: "Support", href: "/support" },
  { label: "Tasks", href: "/tasks", badge: true },
  { label: "KPI", href: "/kpi" },
];

/* flat list for QuickSearch links */
const ALL_NAV_LINKS = NAV_ITEMS.flatMap(it => it.children ? it.children : [{ label: it.label, href: it.href }]);

type Activity = {
  id: string;
  user_email: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  detail: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function userName(email: string) {
  if (email === "nabil.imdh@gmail.com") return "Nabil";
  if (email === "s.chitachny@compucom.ma") return "Salim";
  return email.split("@")[0];
}

const ACTION_COLOR: Record<string, string> = {
  create: "#10b981", update: "#3b82f6", delete: "#ef4444", stage: "#f59e0b",
  won: "#16a34a", lost: "#dc2626", convert: "#8b5cf6",
};
const ACTION_LABEL: Record<string, string> = {
  create: "Ajouté", update: "Modifié", delete: "Supprimé", stage: "Stage →",
  won: "Won ✓", lost: "Lost ✗", convert: "Converti",
};

const ENTITY_ICON: Record<string, string> = {
  deal: "💼", account: "🏢", prospect: "🎯", contact: "👤", card: "🃏",
};

// ── Password modal ────────────────────────────────────────────────────────────
function PasswordModal({ onClose, userEmail }: { onClose: () => void; userEmail: string }) {
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  const strength = newPwd.length >= 12 ? 4 : newPwd.length >= 10 ? 3 : newPwd.length >= 8 ? 2 : newPwd.length >= 4 ? 1 : 0;
  const strengthLabel = ["Trop court", "Faible", "Moyen", "Bon", "Fort"][strength];
  const strengthColor = ["#ef4444", "#ef4444", "#f59e0b", "#3b82f6", "#16a34a"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!currentPwd) return setErr("Saisis ton mot de passe actuel.");
    if (newPwd.length < 8) return setErr("Le nouveau mot de passe doit faire au moins 8 caractères.");
    if (newPwd !== confirmPwd) return setErr("Les mots de passe ne correspondent pas.");
    if (newPwd === currentPwd) return setErr("Le nouveau mot de passe doit être différent de l'actuel.");

    setLoading(true);
    try {
      // Étape 1 : vérifier le mot de passe actuel
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPwd,
      });
      if (signInError) {
        setErr("Mot de passe actuel incorrect.");
        setLoading(false);
        return;
      }

      // Étape 2 : mettre à jour avec le nouveau
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => onClose(), 2500);
    } catch (e: any) {
      setErr(e?.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (focused?: boolean): React.CSSProperties => ({
    width: "100%", height: 42, borderRadius: 12,
    border: `1px solid ${focused ? "#0f172a" : "#e2e8f0"}`,
    padding: "0 14px", fontSize: 14, outline: "none",
    boxSizing: "border-box", transition: "border 0.15s",
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.40)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 420,
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <KeyRound style={{ width: 17, height: 17, color: "#475569" }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Changer le mot de passe</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{userEmail}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, borderRadius: 8 }}>
            <X style={{ width: 16, height: 16, color: "#94a3b8" }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>Mot de passe mis à jour !</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Fermeture automatique...</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Mot de passe actuel */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Mot de passe actuel *
                </label>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  placeholder="Ton mot de passe actuel"
                  autoFocus
                  style={inputStyle()}
                />
              </div>

              <div style={{ borderTop: "1px dashed #e2e8f0", margin: "0 -2px" }} />

              {/* Nouveau */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Nouveau mot de passe *
                </label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Min. 8 caractères"
                  style={inputStyle()}
                />
                {/* Force */}
                {newPwd.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{
                          flex: 1, height: 3, borderRadius: 2, transition: "background 0.2s",
                          background: strength >= i ? strengthColor : "#e2e8f0",
                        }}/>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</div>
                  </div>
                )}
              </div>

              {/* Confirmer */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Confirmer le nouveau mot de passe *
                </label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Retape le même mot de passe"
                  style={inputStyle()}
                />
                {/* Match indicator */}
                {confirmPwd.length > 0 && (
                  <div style={{ fontSize: 11, marginTop: 5, fontWeight: 600, color: confirmPwd === newPwd ? "#16a34a" : "#ef4444" }}>
                    {confirmPwd === newPwd ? "✓ Les mots de passe correspondent" : "✗ Ne correspondent pas"}
                  </div>
                )}
              </div>

              {err && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⚠️</span> {err}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                <button type="button" onClick={onClose} style={{
                  flex: 1, height: 42, borderRadius: 12, border: "1px solid #e2e8f0",
                  background: "#fff", fontSize: 13, fontWeight: 500, color: "#475569", cursor: "pointer",
                }}>
                  Annuler
                </button>
                <button type="submit" disabled={loading} style={{
                  flex: 2, height: 42, borderRadius: 12, border: "none",
                  background: loading ? "#94a3b8" : "#0f172a", color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                }}>
                  {loading ? "Vérification..." : "Changer le mot de passe"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Search (Ctrl+K) ────────────────────────────────────────────────────
type SearchResult = { type: 'deal' | 'account' | 'prospect'; id: string; title: string; sub: string }

function QuickSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus() }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(q.trim()), 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current) };
  }, [q]);

  async function search(term: string) {
    setLoading(true);
    const like = `%${term}%`;
    const [{ data: deals }, { data: accounts }, { data: prospects }] = await Promise.all([
      supabase.from("opportunities").select("id,title,amount,status,accounts(name)").ilike("title", like).limit(6),
      supabase.from("accounts").select("id,name,sector,region").ilike("name", like).limit(4),
      supabase.from("prospects").select("id,company_name,contact_name,status").ilike("company_name", like).is("converted_at", null).limit(4),
    ]);
    const res: SearchResult[] = [];
    for (const d of deals || []) {
      const acName = (d as any).accounts?.name || '';
      res.push({ type: 'deal', id: d.id, title: d.title || '—', sub: `${acName} · ${d.status} · ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(d.amount || 0)} MAD` });
    }
    for (const a of accounts || []) {
      res.push({ type: 'account', id: a.id, title: a.name, sub: [a.sector, a.region].filter(Boolean).join(' · ') || 'Compte' });
    }
    for (const p of prospects || []) {
      res.push({ type: 'prospect', id: p.id, title: p.company_name, sub: `${p.contact_name} · ${p.status}` });
    }
    setResults(res);
    setSelected(0);
    setLoading(false);
  }

  function go(r: SearchResult) {
    onClose();
    if (r.type === 'deal') router.push(`/opportunities/${r.id}`);
    else if (r.type === 'account') router.push(`/accounts/${r.id}`);
    else router.push(`/prospection`);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[selected]) { go(results[selected]) }
    else if (e.key === 'Escape') { onClose() }
  }

  const ICONS: Record<string, string> = { deal: '💼', account: '🏢', prospect: '🎯' };
  const LABELS: Record<string, string> = { deal: 'Deal', account: 'Compte', prospect: 'Prospect' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <Search style={{ width: 18, height: 18, color: '#94a3b8', flexShrink: 0 }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            placeholder="Rechercher un deal, compte ou prospect…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#0f172a', background: 'transparent' }} />
          <kbd style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '2px 6px', fontFamily: 'monospace' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Recherche…</div>}
          {!loading && q && results.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Aucun résultat pour &ldquo;{q}&rdquo;</div>}
          {results.map((r, i) => (
            <div key={`${r.type}-${r.id}`} onClick={() => go(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer',
                background: i === selected ? '#f1f5f9' : 'transparent', transition: 'background 0.1s',
              }}
              onMouseEnter={() => setSelected(i)}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {ICONS[r.type]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                {LABELS[r.type]}
              </span>
            </div>
          ))}
        </div>
        {!q && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ALL_NAV_LINKS.map(it => (
              <a key={it.href} href={it.href} onClick={onClose}
                style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '4px 10px', textDecoration: 'none', border: '1px solid #e2e8f0' }}>
                {it.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Keyboard Shortcuts Panel ─────────────────────────────────────────────────
const SHORTCUTS_TEMPLATE = [
  { keys: ["MOD", "K"], label: "Recherche rapide" },
  { keys: ["?"], label: "Afficher les raccourcis" },
  { keys: ["G", "D"], label: "Dashboard" },
  { keys: ["G", "P"], label: "Pipeline" },
  { keys: ["G", "R"], label: "Prospection" },
  { keys: ["G", "A"], label: "Comptes" },
  { keys: ["G", "O"], label: "Deals" },
  { keys: ["G", "T"], label: "Tasks" },
  { keys: ["G", "S"], label: "Supply" },
  { keys: ["G", "J"], label: "Projets" },
  { keys: ["G", "F"], label: "Facturation" },
  { keys: ["G", "E"], label: "Notes de frais" },
  { keys: ["G", "U"], label: "Support" },
  { keys: ["G", "K"], label: "KPI" },
  { keys: ["G", "H"], label: "Historique" },
];

function ShortcutsPanel({ onClose, modKey }: { onClose: () => void; modKey: string }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Raccourcis clavier</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 14, height: 14, color: "#94a3b8" }} />
          </button>
        </div>
        <div style={{ padding: "8px 0" }}>
          {SHORTCUTS_TEMPLATE.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px" }}>
              <span style={{ fontSize: 13, color: "#475569" }}>{s.label}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {s.keys.map((k, j) => (
                  <kbd key={j} style={{ minWidth: 24, height: 24, borderRadius: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", fontSize: 11, fontWeight: 600, color: "#475569", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px", fontFamily: "monospace" }}>
                    {k === 'MOD' ? modKey : k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Appuie sur <kbd style={{ fontSize: 10, background: "#f1f5f9", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", border: "1px solid #e2e8f0" }}>?</kbd> pour afficher ce panneau</span>
        </div>
      </div>
    </div>
  );
}

// ── NavDropdown ──────────────────────────────────────────────────────────────
function NavDropdown({ item, active, path }: { item: NavItem; active: boolean; path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: "5px 10px", borderRadius: 8, fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? "#0f172a" : "#64748b",
          background: active ? "#f1f5f9" : "transparent",
          border: "none", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
        {item.label}
        <ChevronDown style={{ width: 11, height: 11, opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)", overflow: "hidden",
          minWidth: 160, zIndex: 200, padding: "4px",
        }}>
          {item.children!.map(child => {
            const childActive = path === child.href.split('?')[0] || path.startsWith(child.href.split('?')[0] + "/");
            return (
              <Link key={child.href} href={child.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block", padding: "8px 12px", borderRadius: 8,
                  fontSize: 13, fontWeight: childActive ? 600 : 400,
                  color: childActive ? "#0f172a" : "#475569",
                  textDecoration: "none",
                  background: childActive ? "#f1f5f9" : "transparent",
                }}
                onMouseEnter={e => { if (!childActive) (e.currentTarget.style.background = "#f8fafc") }}
                onMouseLeave={e => { if (!childActive) (e.currentTarget.style.background = "transparent") }}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── NavBar ────────────────────────────────────────────────────────────────────
export default function NavBar() {
  const path = usePathname();
  const [email, setEmail]           = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unread, setUnread]         = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [taskCount, setTaskCount]   = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const panelRef    = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<string>("");
  const [isMac, setIsMac] = useState(true);
  useEffect(() => { setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)) }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Global keyboard shortcuts
  const router = useRouter();
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function isInputFocused() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K / Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(v => !v);
        return;
      }

      // Skip shortcuts if typing in a form
      if (isInputFocused()) return;

      // ? key → show shortcuts
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }

      // G + letter navigation shortcuts
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        gPressedRef.current = true;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        gTimerRef.current = setTimeout(() => { gPressedRef.current = false }, 800);
        return;
      }

      if (gPressedRef.current) {
        const routes: Record<string, string> = {
          d: "/dashboard", p: "/pipeline", t: "/tasks", s: "/supply",
          a: "/accounts", o: "/opportunities", k: "/kpi", r: "/prospection",
          h: "/activity", j: "/projects", f: "/invoices", e: "/expenses",
          u: "/support",
        };
        const route = routes[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          gPressedRef.current = false;
          if (gTimerRef.current) clearTimeout(gTimerRef.current);
          router.push(route);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Load pending tasks count for badge (relances + achats + closing retard)
  async function loadTaskCount() {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [{ count: relances }, { data: wonDeals }, { count: closingRetards }] = await Promise.all([
      supabase.from("prospects").select("id", { count: "exact", head: true })
        .is("converted_at", null).neq("status", "Qualifié ✓").lt("next_date", today),
      supabase.from("opportunities").select("id").eq("status", "Won"),
      supabase.from("opportunities").select("id", { count: "exact", head: true })
        .eq("status", "Open").lt("booking_month", thisM).not("booking_month", "is", null),
    ]);
    let achatCount = 0;
    if (wonDeals?.length) {
      const { data: filled } = await supabase.from("purchase_info")
        .select("opportunity_id").in("opportunity_id", wonDeals.map((d: any) => d.id));
      achatCount = wonDeals.length - (filled?.length || 0);
    }
    setTaskCount((relances || 0) + achatCount + (closingRetards || 0));
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const userEmail = data?.user?.email ?? null;
      setEmail(userEmail);
      if (userEmail) { await loadLastRead(userEmail); loadTaskCount(); }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user?.email ?? null;
      setEmail(userEmail);
      if (userEmail) loadLastRead(userEmail);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  async function loadLastRead(userEmail: string) {
    const { data } = await supabase
      .from("notification_reads").select("last_read_at")
      .eq("user_email", userEmail).single();
    const lastRead = data?.last_read_at ?? "";
    lastReadRef.current = lastRead;
    await loadActivities(lastRead);
  }

  async function loadActivities(lastRead?: string) {
    const { data } = await supabase
      .from("activity_log")
      .select("id,user_email,action_type,entity_type,entity_id,entity_name,detail,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (data) {
      setActivities(data as Activity[]);
      const ref = lastRead ?? lastReadRef.current;
      const newCount = ref ? data.filter(a => a.created_at > ref).length : Math.min(data.length, 5);
      setUnread(newCount);
    }
  }

  useEffect(() => {
    const channel = supabase.channel("activity_log_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        const newAct = payload.new as Activity;
        setActivities(prev => [newAct, ...prev.slice(0, 49)]);
        setUnread(prev => prev + 1);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function openNotifs() {
    setShowNotifs(true); setUnread(0);
    const now = new Date().toISOString();
    lastReadRef.current = now;
    if (email) {
      await supabase.from("notification_reads")
        .upsert({ user_email: email, last_read_at: now }, { onConflict: "user_email" });
    }
  }

  // Close panels on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      <div style={{ borderBottom: "1px solid #e2e8f0", background: "#fff", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 8 }}>

          <Link href="/dashboard" style={{ fontWeight: 900, fontSize: 15, letterSpacing: "1.5px", color: "#0f172a", textDecoration: "none", marginRight: 16 }}>
            CRM-PIPE
          </Link>

          <nav style={{ display: "flex", gap: 2, flex: 1 }}>
            {NAV_ITEMS.map(it => {
              const allPaths = it.children ? it.children.map(c => c.href.split('?')[0]) : [it.href];
              const active = allPaths.some(p => path === p || path.startsWith(p + "/"));
              if (it.children) {
                return (
                  <NavDropdown key={it.label} item={it} active={active} path={path} />
                );
              }
              return (
                <Link key={it.href} href={it.href} style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? "#0f172a" : "#64748b",
                  textDecoration: "none",
                  background: active ? "#f1f5f9" : "transparent",
                  position: "relative", display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {it.label}
                  {it.badge && taskCount > 0 && (
                    <span style={{
                      minWidth: 16, height: 16, borderRadius: 8,
                      background: "#ef4444", color: "#fff",
                      fontSize: 10, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      padding: "0 4px",
                    }}>
                      {taskCount > 9 ? "9+" : taskCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

            {/* ── Quick Search ── */}
            <button
              onClick={() => setShowSearch(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 10px", borderRadius: 10,
                border: "1px solid #e2e8f0", background: "#f8fafc",
                cursor: "pointer", fontSize: 12, color: "#94a3b8",
              }}
            >
              <Search style={{ width: 14, height: 14 }} />
              <span>Recherche</span>
              <kbd style={{ fontSize: 10, background: '#e2e8f0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontWeight: 600, color: '#64748b' }}>{modKey}+K</kbd>
            </button>

            {/* ── User menu ── */}
            {email && (
              <div style={{ position: "relative" }} ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    height: 34, padding: "0 10px", borderRadius: 10,
                    border: "1px solid #e2e8f0", background: showUserMenu ? "#f1f5f9" : "#fff",
                    cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#475569",
                  }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {userName(email)[0]}
                  </div>
                  {userName(email)}
                  <ChevronDown style={{ width: 12, height: 12, color: "#94a3b8", transform: showUserMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>

                {showUserMenu && (
                  <div style={{
                    position: "absolute", top: 42, right: 0, width: 200,
                    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.10)", overflow: "hidden", zIndex: 200,
                  }}>
                    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{userName(email)}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
                    </div>
                    <div style={{ padding: "6px" }}>
                      <Link
                        href="/profile"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 9,
                          padding: "9px 10px", borderRadius: 9, border: "none",
                          background: "none", cursor: "pointer", fontSize: 13,
                          color: "#374151", fontWeight: 500, textAlign: "left",
                          textDecoration: "none",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <User style={{ width: 14, height: 14, color: "#64748b" }} />
                        Mon profil
                      </Link>
                      <button
                        onClick={() => { setShowUserMenu(false); setShowPwdModal(true); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 9,
                          padding: "9px 10px", borderRadius: 9, border: "none",
                          background: "none", cursor: "pointer", fontSize: 13,
                          color: "#374151", fontWeight: 500, textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <KeyRound style={{ width: 14, height: 14, color: "#64748b" }} />
                        Changer le mot de passe
                      </button>
                      <button
                        onClick={logout}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 9,
                          padding: "9px 10px", borderRadius: 9, border: "none",
                          background: "none", cursor: "pointer", fontSize: 13,
                          color: "#dc2626", fontWeight: 500, textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <LogOut style={{ width: 14, height: 14, color: "#dc2626" }} />
                        Déconnexion
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Notifications ── */}
            <div style={{ position: "relative" }} ref={panelRef}>
              <button
                onClick={openNotifs}
                style={{ position: "relative", width: 36, height: 36, borderRadius: 10, border: "1px solid #e2e8f0", background: showNotifs ? "#f1f5f9" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Bell style={{ width: 16, height: 16, color: "#475569" }} />
                {unread > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #fff" }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div style={{ position: "absolute", top: 44, right: 0, width: 380, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,0.12)", overflow: "hidden", zIndex: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Activité de l'équipe</span>
                    <button onClick={() => setShowNotifs(false)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
                      <X style={{ width: 14, height: 14, color: "#94a3b8" }} />
                    </button>
                  </div>
                  <div style={{ maxHeight: 440, overflowY: "auto" }}>
                    {activities.length === 0 ? (
                      <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>Aucune activité récente</div>
                    ) : activities.map((a, idx) => {
                      const color = ACTION_COLOR[a.action_type] || "#64748b";
                      const label = ACTION_LABEL[a.action_type] || a.action_type;
                      const isNew = lastReadRef.current ? a.created_at > lastReadRef.current : idx < 5;
                      const icon = ENTITY_ICON[a.entity_type] || "📋"
                      return (
                        <div key={a.id} style={{ display: "flex", gap: 12, padding: "11px 16px", borderBottom: "1px solid #f8fafc", background: isNew ? "#fefce8" : "#fff", transition: "background 0.15s" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                            {icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: "#0f172a", lineHeight: 1.5 }}>
                              <b style={{ color: a.user_email === email ? "#2563eb" : "#0f172a" }}>{userName(a.user_email)}</b>
                              {" "}<span style={{ color, fontWeight: 600 }}>{label}</span>
                              {" "}
                              {a.entity_id && a.entity_type === "deal"
                                ? <a href={`/opportunities/${a.entity_id}`} onClick={() => setShowNotifs(false)} style={{ fontWeight: 600, color: "#0f172a", textDecoration: "underline", textDecorationColor: "#e2e8f0" }}>{a.entity_name}</a>
                                : <span style={{ fontWeight: 600 }}>{a.entity_name}</span>
                              }
                            </div>
                            {a.detail && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.detail}</div>}
                            <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 3 }}>{timeAgo(a.created_at)}</div>
                          </div>
                          {isNew && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", marginTop: 8, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Activité de l'équipe</span>
                    <a href="/activity" onClick={() => setShowNotifs(false)}
                      style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", textDecoration: "none" }}>
                      Voir tout l'historique →
                    </a>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Password modal (outside navbar flow) ── */}
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} userEmail={email || ""} />}

      {/* ── Quick Search modal ── */}
      {showSearch && <QuickSearch onClose={() => setShowSearch(false)} />}

      {/* ── Keyboard Shortcuts panel ── */}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} modKey={modKey} />}
    </>
  );
}
