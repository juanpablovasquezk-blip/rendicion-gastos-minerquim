"use client";

import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent = window.navigator.userAgent || "";
      const iosCheck = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standaloneCheck =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone === true);

      setIsIOS(iosCheck);
      setIsStandalone(standaloneCheck);

      if ("serviceWorker" in navigator && "PushManager" in window) {
        setIsSupported(true);
        if ("Notification" in window) {
          setPermission(Notification.permission);
        }
        checkExistingSubscription();
      }
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (err) {
      console.error("Error comprobando suscripción push:", err);
    }
  };

  const subscribe = useCallback(async (): Promise<boolean> => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidKey) {
      setFeedback({
        type: "error",
        message: "Clave VAPID pública no configurada en el servidor.",
      });
      return false;
    }

    if (!isSupported) {
      if (isIOS && !isStandalone) {
        setFeedback({
          type: "info",
          message: "En iPhone: primero pulsa Compartir (⎋) y 'Agregar al inicio' para habilitar las alertas.",
        });
      } else {
        setFeedback({
          type: "error",
          message: "Este navegador no soporta notificaciones push.",
        });
      }
      return false;
    }

    setLoading(true);
    setFeedback(null);

    try {
      // 1. Pedir permiso al usuario
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setLoading(false);
        setFeedback({
          type: "error",
          message: "Permiso de notificaciones denegado en el navegador.",
        });
        return false;
      }

      // 2. Obtener Service Worker
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // 3. Registrar suscripción en Supabase
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "No se pudo guardar la suscripción.");
      }

      setIsSubscribed(true);
      setLoading(false);
      setFeedback({
        type: "success",
        message: "¡Alertas activadas exitosamente en este dispositivo!",
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error al suscribir a notificaciones push:", msg);
      setLoading(false);
      setFeedback({
        type: "error",
        message: `Error al activar: ${msg}`,
      });
      return false;
    }
  }, [isSupported, isIOS, isStandalone]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    feedback,
    isIOS,
    isStandalone,
    subscribe,
    clearFeedback: () => setFeedback(null),
  };
}
