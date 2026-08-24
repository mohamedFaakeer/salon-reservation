"use client";

import type { NotificationQuotaRecord } from "../lib/api-client";

function QuotaBar({
  channel,
  sent,
  limit,
  color,
}: {
  channel: string;
  sent: number;
  limit: number;
  color: string;
}) {
  const percent = limit > 0 ? Math.min(Math.round((sent / limit) * 100), 100) : 0;
  const isNearLimit = percent >= 80;
  const isAtLimit = percent >= 100;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{channel}</span>
        <span className="font-mono text-slate-500">
          <span className={isAtLimit ? "font-bold text-red-600" : isNearLimit ? "font-bold text-amber-600" : "text-slate-900"}>
            {sent}
          </span>
          <span className="text-slate-400"> / {limit}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full transition-all duration-300 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{percent}% used</span>
        {isAtLimit ? (
          <span className="font-semibold text-red-600">Quota reached</span>
        ) : isNearLimit ? (
          <span className="font-semibold text-amber-600">Near limit</span>
        ) : (
          <span>{limit - sent} remaining</span>
        )}
      </div>
    </div>
  );
}

export function NotificationQuotaCard({ quota }: { quota: NotificationQuotaRecord | null }) {
  if (!quota) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Monthly Notification Quota</h2>
          <p className="text-xs text-slate-500">Usage resets on the 1st of next month ({quota.month})</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuotaBar
          channel="SMS"
          sent={quota.smsSent}
          limit={quota.smsLimit}
          color={quota.smsSent >= quota.smsLimit ? "bg-red-500" : quota.smsSent >= quota.smsLimit * 0.8 ? "bg-amber-500" : "bg-teal-600"}
        />
        <QuotaBar
          channel="WhatsApp"
          sent={quota.whatsappSent}
          limit={quota.whatsappLimit}
          color={quota.whatsappSent >= quota.whatsappLimit ? "bg-red-500" : quota.whatsappSent >= quota.whatsappLimit * 0.8 ? "bg-amber-500" : "bg-emerald-600"}
        />
        <QuotaBar
          channel="Email"
          sent={quota.emailSent}
          limit={quota.emailLimit}
          color={quota.emailSent >= quota.emailLimit ? "bg-red-500" : quota.emailSent >= quota.emailLimit * 0.8 ? "bg-amber-500" : "bg-indigo-600"}
        />
        <QuotaBar
          channel="Console"
          sent={quota.consoleSent}
          limit={quota.consoleLimit}
          color="bg-slate-600"
        />
      </div>
    </div>
  );
}
