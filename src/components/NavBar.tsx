"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Bell, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard-v3" },
  { label: "Pipeline",  href: "/pipeline" },
  { label: "Comptes",   href: "/accounts" },
  { label: "Deals",     href: "/opportunities" },
  { label: "KPI",       href: "/kpi" },
  { label: "Inside",    href: "/inside" },
];

type Activity = {
  id: string;
  user_email: string;
  action_type: string;
  entity_type: string;
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
  if (email === 'nabil.imdh@gmail.com') return 'Nabil';
  if (email === 's.chitachny@compucom.ma') return 'Salim';
  return email.split('@')[0];
}

const ACTION_COLOR: Record<string, string> = {
  create: '#10b981',
  update: '#3b82f6',
  delete: '#ef4444',
  stage:  '#f59e0b',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Ajouté',
  update: 'Modifié',
  delete: 'Supprimé',
  stage:  'Stage →',
};

export default function NavBar() {
  const path = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<string>(
    typeof window !== 'undefined' ? (localStorage.getItem('crm_last_read') || '') : ''
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data?.user?.email ?? null);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    loadActivities();
    // Real-time subscription
    const channel = supabase
      .channel('activity_log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const newAct = payload.new as Activity;
        setActivities(prev => [newAct, ...prev.slice(0, 49)]);
        setUnread(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadActivities() {
    const { data } = await supabase
      .from('activity_log')
      .select('id,user_email,action_type,entity_type,entity_name,detail,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setActivities(data as Activity[]);
      const lastRead = lastReadRef.current;
      const newCount = lastRead
        ? data.filter(a => a.created_at > lastRead).length
        : Math.min(data.length, 5);
      setUnread(newCount);
    }
  }

  function openNotifs() {
    setShowNotifs(true);
    setUnread(0);
    const now = new Date().toISOString();
    lastReadRef.current = now;
    if (typeof window !== 'undefined') localStorage.setItem('crm_last_read', now);
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    if (showNotifs) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifs]);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fff', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Logo */}
        <Link href="/dashboard-v3" style={{ fontWeight: 900, fontSize: 15, letterSpacing: '1.5px', color: '#0f172a', textDecoration: 'none', marginRight: 16 }}>
          CRM-PIPE
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
          {NAV_ITEMS.map(it => {
            const active = path === it.href || path.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? '#0f172a' : '#64748b', textDecoration: 'none',
                background: active ? '#f1f5f9' : 'transparent',
                transition: 'all 0.15s',
              }}>
                {it.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* User name */}
          {email && (
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              {userName(email)}
            </span>
          )}

          {/* Bell */}
          <div style={{ position: 'relative' }} ref={panelRef}>
            <button
              onClick={openNotifs}
              style={{ position: 'relative', width: 36, height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: showNotifs ? '#f1f5f9' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Bell style={{ width: 16, height: 16, color: '#475569' }} />
              {unread > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18,
                  borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 10,
                  fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px', border: '2px solid #fff',
                }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {/* Notifications panel */}
            {showNotifs && (
              <div style={{
                position: 'absolute', top: 44, right: 0, width: 360,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
                boxShadow: '0 10px 40px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 200,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Activité récente</span>
                  <button onClick={() => setShowNotifs(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                    <X style={{ width: 14, height: 14, color: '#94a3b8' }} />
                  </button>
                </div>

                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {activities.length === 0 ? (
                    <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                      Aucune activité récente
                    </div>
                  ) : (
                    activities.map(a => {
                      const color = ACTION_COLOR[a.action_type] || '#64748b';
                      const label = ACTION_LABEL[a.action_type] || a.action_type;
                      return (
                        <div key={a.id} style={{ display: 'flex', gap: 12, padding: '11px 16px', borderBottom: '1px solid #f8fafc', transition: 'background 0.1s' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.4 }}>
                              <b>{userName(a.user_email)}</b>
                              {' '}<span style={{ color, fontWeight: 600 }}>{label}</span>
                              {' '}<span style={{ fontWeight: 500 }}>{a.entity_name}</span>
                            </div>
                            {a.detail && (
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.detail}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Logout */}
          <button onClick={logout} style={{ height: 34, borderRadius: 10, padding: '0 14px', fontSize: 12, fontWeight: 500, background: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
