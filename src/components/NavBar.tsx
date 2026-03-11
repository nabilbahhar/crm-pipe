"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Bell, X, ChevronDown, KeyRound, LogOut, Search, User, MessageSquare, ListChecks, Menu } from "lucide-react";
import { ownerName } from "@/lib/utils";

type NavItem = { label: string; href: string; badge?: boolean; children?: { label: string; href: string }[] }

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Vente", href: "/pipeline", children: [
    { label: "Prospection", href: "/prospection" },
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
    { label: "Renouvellements", href: "/renewals" },
  ]},
  { label: "Finance", href: "/invoices", children: [
    { label: "Facturation", href: "/invoices" },
    { label: "Notes de frais", href: "/expenses" },
  ]},
  { label: "Marketing", href: "/events", children: [
    { label: "Événements", href: "/events" },
  ]},
  { label: "Support", href: "/support" },
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
  return ownerName(email);
}

const ACTION_COLOR: Record<string, string> = {
  create: "#10b981", update: "#3b82f6", delete: "#ef4444", stage: "#f59e0b",
  won: "#16a34a", lost: "#dc2626", convert: "#8b5cf6", message: "#0866ff",
};
const ACTION_LABEL: Record<string, string> = {
  create: "Ajouté", update: "Modifié", delete: "Supprimé", stage: "Stage →",
  won: "Won ✓", lost: "Lost ✗", convert: "Converti", message: "💬 Message",
};

const ENTITY_ICON: Record<string, string> = {
  deal: "💼", account: "🏢", prospect: "🎯", contact: "👤", card: "🃏", message: "💬",
};

function describeActivity(a: Activity, currentEmail: string | null): string {
  const name = userName(a.user_email);
  const isMe = a.user_email === currentEmail;
  const who = isMe ? "Vous avez" : `${name} a`;

  switch (a.action_type) {
    case 'create': return `${who} créé ${a.entity_type === 'deal' ? 'le deal' : a.entity_type === 'prospect' ? 'le prospect' : ''} "${a.entity_name}"`;
    case 'update': return `${who} modifié ${a.entity_type === 'deal' ? 'le deal' : ''} "${a.entity_name}"${a.detail ? ` — ${a.detail}` : ''}`;
    case 'delete': return `${who} supprimé ${a.entity_type === 'deal' ? 'le deal' : ''} "${a.entity_name}"`;
    case 'stage': return `${who} changé l'étape du deal "${a.entity_name}"${a.detail ? ` → ${a.detail}` : ''}`;
    case 'won': return `${who} gagné le deal "${a.entity_name}" 🎉`;
    case 'lost': return `${who} perdu le deal "${a.entity_name}"`;
    case 'convert': return `${who} converti le prospect "${a.entity_name}" en deal`;
    case 'message': return `${name} vous a envoyé un message : "${a.entity_name}"`;
    default: return `${who} ${a.action_type} "${a.entity_name}"`;
  }
}

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
    try {
      const escaped = term.replace(/[%_\\]/g, '\\$&');
      const like = `%${escaped}%`;
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
    } catch (err) {
      console.warn('QuickSearch error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
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
              <Link key={it.href} href={it.href} onClick={onClose}
                style={{ fontSize: 11, fontWeight: 500, color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '4px 10px', textDecoration: 'none', border: '1px solid #e2e8f0' }}>
                {it.label}
              </Link>
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
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const panelRef    = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<string>("");
  const [isMac, setIsMac] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => { setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)) }, []);
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false) }, [path]);

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

  // Load user avatar from profile (safe — never throws)
  async function loadAvatar(userEmail: string) {
    try {
      const res = await supabase
        .from("user_profiles")
        .select("avatar_url")
        .eq("user_email", userEmail);
      const row = res?.data?.[0];
      if (!row?.avatar_url) return;
      const urlRes = await supabase.storage
        .from("profile-avatars")
        .createSignedUrl(row.avatar_url, 3600);
      if (urlRes?.data?.signedUrl) setAvatarUrl(urlRes.data.signedUrl);
    } catch (_e) { /* silently ignore — avatar is optional */ }
  }

  // Load unread messages count
  async function loadUnreadMsgs(userEmail: string) {
    const { count } = await supabase
      .from("team_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_email", userEmail)
      .is("read_at", null);
    setUnreadMsgs(count || 0);
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const userEmail = data?.user?.email ?? null;
      setEmail(userEmail);
      if (userEmail) { await loadLastRead(userEmail); loadTaskCount().catch(e => console.warn('loadTaskCount error:', e)); loadUnreadMsgs(userEmail).catch(e => console.warn('loadUnreadMsgs error:', e)); loadAvatar(userEmail); }
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

  // Real-time: new messages → increment unread badge + inject into notifications
  useEffect(() => {
    if (!email) return;
    const msgChannel = supabase.channel("team_messages_nav")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_email !== email) {
          setUnreadMsgs(prev => prev + 1);
          // Also inject into notification panel as a fake activity
          const msgActivity: Activity = {
            id: `msg-${msg.id}`,
            user_email: msg.sender_email,
            action_type: "message",
            entity_type: "message",
            entity_id: null,
            entity_name: (msg.content || "").slice(0, 60) + ((msg.content || "").length > 60 ? "…" : ""),
            detail: msg.file_name ? `📎 ${msg.file_name}` : null,
            created_at: msg.created_at,
          };
          setActivities(prev => [msgActivity, ...prev.slice(0, 49)]);
          setUnread(prev => prev + 1);
        }
      }).subscribe();
    return () => { supabase.removeChannel(msgChannel); };
  }, [email]);

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

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen}
            className="md:hidden"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: "none", background: mobileMenuOpen ? "#f1f5f9" : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              marginRight: 4,
            }}
          >
            {mobileMenuOpen ? <X style={{ width: 20, height: 20, color: "#0f172a" }} /> : <Menu style={{ width: 20, height: 20, color: "#0f172a" }} />}
          </button>

          <Link href="/dashboard" style={{ fontWeight: 900, fontSize: 15, letterSpacing: "1.5px", color: "#0f172a", textDecoration: "none", marginRight: 16 }}>
            CRM-PIPE
          </Link>

          <nav className="hidden md:flex" style={{ gap: 2, flex: 1 }}>
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
                      {taskCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

            {/* ── Quick Search (compact) ── */}
            <button
              onClick={() => setShowSearch(true)}
              title={`Recherche (${modKey}+K)`}
              aria-label={`Recherche rapide (${modKey}+K)`}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                border: "none", background: "#e4e6eb",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#d8dadf")}
              onMouseLeave={e => (e.currentTarget.style.background = "#e4e6eb")}
            >
              <Search style={{ width: 18, height: 18, color: "#050505" }} />
            </button>

            {/* ── Messages (Facebook-style circle) ── */}
            <Link href="/messages" title="Messages" aria-label="Messages"
              style={{
                position: "relative", width: 40, height: 40, borderRadius: "50%",
                border: "none", background: path === "/messages" ? "#e7f3ff" : "#e4e6eb",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none", transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (path !== "/messages") e.currentTarget.style.background = "#d8dadf" }}
              onMouseLeave={e => { if (path !== "/messages") e.currentTarget.style.background = "#e4e6eb" }}
            >
              <MessageSquare style={{ width: 18, height: 18, color: path === "/messages" ? "#0866ff" : "#050505" }} />
              {unreadMsgs > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, background: "#e41e3f", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                  {unreadMsgs}
                </span>
              )}
            </Link>

            {/* ── Tasks (Facebook-style circle) ── */}
            <Link href="/tasks" title="Tâches" aria-label="Tâches"
              style={{
                position: "relative", width: 40, height: 40, borderRadius: "50%",
                border: "none", background: path === "/tasks" ? "#fff3e0" : "#e4e6eb",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none", transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (path !== "/tasks") e.currentTarget.style.background = "#d8dadf" }}
              onMouseLeave={e => { if (path !== "/tasks") e.currentTarget.style.background = "#e4e6eb" }}
            >
              <ListChecks style={{ width: 18, height: 18, color: path === "/tasks" ? "#e65100" : "#050505" }} />
              {taskCount > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, background: "#e65100", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                  {taskCount}
                </span>
              )}
            </Link>

            {/* ── Notifications (Facebook-style circle) ── */}
            <div style={{ position: "relative" }} ref={panelRef}>
              <button
                onClick={openNotifs}
                title="Notifications"
                aria-label="Notifications"
                style={{
                  position: "relative", width: 40, height: 40, borderRadius: "50%",
                  border: "none", background: showNotifs ? "#e7f3ff" : "#e4e6eb",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!showNotifs) e.currentTarget.style.background = "#d8dadf" }}
                onMouseLeave={e => { if (!showNotifs) e.currentTarget.style.background = "#e4e6eb" }}
              >
                <Bell style={{ width: 18, height: 18, color: showNotifs ? "#0866ff" : "#050505" }} />
                {unread > 0 && (
                  <span style={{ position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, background: "#e41e3f", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
                    {unread}
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
                      const isNew = lastReadRef.current ? a.created_at > lastReadRef.current : idx < 5;
                      const icon = ENTITY_ICON[a.entity_type] || "📋";
                      const desc = describeActivity(a, email);
                      const linkHref = a.entity_type === "message" ? "/messages" : a.entity_id && a.entity_type === "deal" ? `/opportunities/${a.entity_id}` : null;
                      return (
                        <div key={a.id} style={{ display: "flex", gap: 12, padding: "11px 16px", borderBottom: "1px solid #f8fafc", background: isNew ? "#fefce8" : "#fff", transition: "background 0.15s", cursor: linkHref ? "pointer" : "default" }}
                          onClick={() => { if (linkHref) { setShowNotifs(false); router.push(linkHref); } }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                            {icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: "#0f172a", lineHeight: 1.5 }}>
                              {desc}
                            </div>
                            <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 3 }}>{timeAgo(a.created_at)}</div>
                          </div>
                          {isNew && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", marginTop: 8, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Activité de l'équipe</span>
                    <Link href="/activity" onClick={() => setShowNotifs(false)}
                      style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", textDecoration: "none" }}>
                      Voir tout l'historique →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* ── User Avatar (Facebook-style circle) ── */}
            {email && (
              <div style={{ position: "relative" }} ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  title={userName(email)}
                  aria-label={`Menu profil — ${userName(email)}`}
                  style={{
                    width: 40, height: 40, borderRadius: "50%",
                    border: showUserMenu ? "2px solid #0866ff" : "2px solid transparent",
                    background: avatarUrl ? "transparent" : "#0f172a", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0, transition: "border-color 0.15s, box-shadow 0.15s",
                    boxShadow: showUserMenu ? "0 0 0 2px rgba(8,102,255,0.2)" : "none",
                    overflow: "hidden",
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1, userSelect: "none" }}>
                      {userName(email)[0]}
                    </span>
                  )}
                </button>

                {showUserMenu && (
                  <div style={{
                    position: "absolute", top: 48, right: 0, width: 240,
                    background: "#fff", borderRadius: 12,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)", overflow: "hidden", zIndex: 200,
                  }}>
                    <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: avatarUrl ? "transparent" : "#0f172a", color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : userName(email)[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#050505" }}>{userName(email)}</div>
                          <div style={{ fontSize: 12, color: "#65676b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{email}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "4px 8px" }}>
                      <Link
                        href="/profile"
                        onClick={() => setShowUserMenu(false)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 8px", borderRadius: 8, border: "none",
                          background: "none", cursor: "pointer", fontSize: 14,
                          color: "#050505", fontWeight: 500, textAlign: "left",
                          textDecoration: "none",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f2f2f2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e4e6eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <User style={{ width: 16, height: 16, color: "#050505" }} />
                        </div>
                        Mon profil
                      </Link>
                      <button
                        onClick={() => { setShowUserMenu(false); setShowPwdModal(true); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 8px", borderRadius: 8, border: "none",
                          background: "none", cursor: "pointer", fontSize: 14,
                          color: "#050505", fontWeight: 500, textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f2f2f2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e4e6eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <KeyRound style={{ width: 16, height: 16, color: "#050505" }} />
                        </div>
                        Mot de passe
                      </button>
                      <div style={{ height: 1, background: "#f0f0f0", margin: "4px 0" }} />
                      <button
                        onClick={logout}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 8px", borderRadius: 8, border: "none",
                          background: "none", cursor: "pointer", fontSize: 14,
                          color: "#050505", fontWeight: 500, textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f2f2f2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e4e6eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LogOut style={{ width: 16, height: 16, color: "#050505" }} />
                        </div>
                        Déconnexion
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Mobile navigation menu (accordion) ── */}
      {mobileMenuOpen && (
        <div className="md:hidden" style={{
          borderBottom: "1px solid #e2e8f0", background: "#fff",
          padding: "8px 16px 12px", maxHeight: "70vh", overflowY: "auto",
        }}>
          {NAV_ITEMS.map(it => {
            const allPaths = it.children ? it.children.map(c => c.href.split('?')[0]) : [it.href];
            const active = allPaths.some(p => path === p || path.startsWith(p + "/"));
            if (it.children) {
              return (
                <div key={it.label} style={{ marginBottom: 4 }}>
                  <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: active ? "#0f172a" : "#64748b" }}>
                    {it.label}
                  </div>
                  {it.children.map(child => {
                    const childActive = path === child.href.split('?')[0];
                    return (
                      <Link key={child.href} href={child.href}
                        onClick={() => setMobileMenuOpen(false)}
                        style={{
                          display: "block", padding: "8px 12px 8px 28px", fontSize: 13,
                          fontWeight: childActive ? 600 : 400,
                          color: childActive ? "#0f172a" : "#475569",
                          textDecoration: "none",
                          background: childActive ? "#f1f5f9" : "transparent",
                          borderRadius: 8,
                        }}>
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            return (
              <Link key={it.href} href={it.href}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: "block", padding: "8px 12px", fontSize: 13, borderRadius: 8,
                  fontWeight: active ? 600 : 400,
                  color: active ? "#0f172a" : "#64748b",
                  textDecoration: "none",
                  background: active ? "#f1f5f9" : "transparent",
                  marginBottom: 2,
                }}>
                {it.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Password modal (outside navbar flow) ── */}
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} userEmail={email || ""} />}

      {/* ── Quick Search modal ── */}
      {showSearch && <QuickSearch onClose={() => setShowSearch(false)} />}

      {/* ── Keyboard Shortcuts panel ── */}
      {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} modKey={modKey} />}
    </>
  );
}
