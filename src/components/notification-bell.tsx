import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function timeAgo(timestamp: number, language: string) {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return localize({ en: "Just now", ar: "الآن" }, language);
  if (minutes < 60) return language === "ar" ? `${minutes} د` : `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return language === "ar" ? `${hours} س` : `${hours}h`;
  return new Date(timestamp).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { day: "2-digit", month: "short" });
}

export function NotificationBell() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user ? { actorUserId: user.id as Id<"users"> } : "skip";
  const notifications = useQuery(api.notifications.listNotificationsForActor, queryArgs);
  const unreadCount = useQuery(api.notifications.countUnreadNotificationsForActor, queryArgs);
  const markRead = useMutation(api.notifications.markNotificationRead);
  const markAllRead = useMutation(api.notifications.markAllNotificationsRead);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleMarkAll() {
    if (!isBetterAuthConfigured || !user) return;
    setPending(true);
    try {
      await markAllRead({ actorUserId: user.id as Id<"users"> });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="icon" aria-label={localize({ en: "Notifications", ar: "الإشعارات" }, language)} onClick={() => setOpen((current) => !current)}>
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount && unreadCount > 0 ? (
          <span className="absolute -top-1 end-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div
          className={cn(
            "absolute z-40 mt-2 w-80 max-w-[90vw] rounded-lg border border-border/70 bg-card p-3 shadow-card",
            language === "ar" ? "start-0" : "end-0"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{localize({ en: "Notifications", ar: "الإشعارات" }, language)}</span>
            <Button type="button" size="sm" variant="ghost" disabled={pending || !unreadCount} onClick={() => void handleMarkAll()}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
              {localize({ en: "Mark all read", ar: "تعليم الكل" }, language)}
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications === undefined ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{localize({ en: "Loading...", ar: "جار التحميل..." }, language)}</p>
            ) : notifications.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{localize({ en: "No notifications yet.", ar: "لا توجد إشعارات بعد." }, language)}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {notifications.map((notification) => (
                  <li
                    key={notification._id}
                    className={cn(
                      "rounded-md px-2 py-2 transition",
                      notification.readAt ? "bg-transparent" : "bg-primary/5"
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-1 text-start"
                      onClick={() => {
                        if (isBetterAuthConfigured && user && !notification.readAt) {
                          void markRead({ actorUserId: user.id as Id<"users">, notificationId: notification._id });
                        }
                      }}
                    >
                      <span className="text-sm font-semibold">{language === "ar" ? notification.titleAr : notification.titleEn}</span>
                      <span className="text-xs text-muted-foreground">{language === "ar" ? notification.bodyAr : notification.bodyEn}</span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(notification.createdAt, language)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
