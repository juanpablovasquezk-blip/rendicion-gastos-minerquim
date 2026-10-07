"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Wallet,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Smartphone,
  SmartphoneNfc,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePushNotifications } from "@/lib/notifications/use-push-notifications";

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "ahora mismo";
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days}d`;
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "fund_requested":
      return <Wallet className="text-amber-500" size={18} />;
    case "fund_approved":
    case "fund_deposited":
      return <CheckCircle2 className="text-emerald-500" size={18} />;
    case "fund_rejected":
    case "expense_rejected":
      return <XCircle className="text-rose-500" size={18} />;
    case "expense_submitted":
      return <Receipt className="text-blue-500" size={18} />;
    case "expense_approved":
      return <CheckCircle2 className="text-emerald-500" size={18} />;
    default:
      return <Bell className="text-primary" size={18} />;
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    loading: pushLoading,
    subscribe: subscribePush,
  } = usePushNotifications();

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Cargar notificaciones y configurar realtime
  useEffect(() => {
    const sb = createClient();
    let channel: ReturnType<typeof sb.channel> | null = null;

    async function init() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Cargar últimas 20 notificaciones
      const { data, error } = await sb
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: AppNotification) => !n.is_read).length);
      }
      setLoading(false);

      // Escuchar cambios en Realtime
      channel = sb
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
            setUnreadCount((c) => c + 1);

            // Audio o vibración leve si la ventana está activa
            if ("vibrate" in navigator) {
              navigator.vibrate(50);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as AppNotification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
            // Recalcular no leídos
            setNotifications((current) => {
              setUnreadCount(current.filter((n) => !n.is_read).length);
              return current;
            });
          }
        )
        .subscribe();
    }

    init();

    return () => {
      if (channel) {
        sb.removeChannel(channel);
      }
    };
  }, []);

  const markAsRead = async (id: string) => {
    const sb = createClient();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    await sb.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const markAllAsRead = async () => {
    const sb = createClient();
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    await sb.from("notifications").update({ is_read: true }).in("id", unreadIds);
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      startTransition(() => {
        router.push(notif.link as string);
      });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botón Campana */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        title="Notificaciones"
        aria-label="Abrir panel de notificaciones"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:bg-muted active:scale-95"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow-sm animate-in fade-in zoom-in duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl border border-border bg-surface p-0 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {unreadCount} nuevas
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck size={14} />
                Marcar leídas
              </button>
            )}
          </div>

          {/* Banner de Push Notifications si no está suscrito */}
          {pushSupported && !pushSubscribed && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <SmartphoneNfc size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span>¿Activar alertas en tu móvil?</span>
              </div>
              <button
                onClick={subscribePush}
                disabled={pushLoading}
                className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {pushLoading ? <Loader2 size={12} className="animate-spin" /> : "Activar"}
              </button>
            </div>
          )}

          {/* Lista de Notificaciones */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/50">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 size={24} className="animate-spin mb-2" />
                <span className="text-xs">Cargando...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 mb-2">
                  <Bell size={22} className="text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">Estás al día</p>
                <p className="text-xs mt-0.5">No tienes notificaciones por ahora.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group flex items-start gap-3 p-3.5 transition cursor-pointer hover:bg-muted/70 ${
                    !n.is_read ? "bg-primary/5 font-medium" : "opacity-90"
                  }`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-border shadow-xs">
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className={`text-xs truncate ${!n.is_read ? "font-bold text-foreground" : "font-semibold text-foreground/80"}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-0.5">
                        <Clock size={10} />
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0 self-center" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
