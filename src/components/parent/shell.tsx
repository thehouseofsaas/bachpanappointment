import type { ReactNode } from "react";
import { Doodles, RainbowHeader, WavyDivider } from "@/components/art";
import { AnchorButton } from "@/components/ui/button";
import { formatPhone, waNumber } from "@/domain/phone";
import type { AppSettings } from "@/lib/settings";
import { t } from "@/lib/strings";

/** Page frame for parents: rainbow header, school name, content, office contact. */
export function ParentShell({
  settings,
  children,
  compact = false,
}: {
  settings: AppSettings;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-cream">
      <div className="pointer-events-none absolute inset-x-0 top-40 mx-auto max-w-md" aria-hidden="true">
        <Doodles />
      </div>
      <header className="relative bg-wash">
        <div className={`mx-auto max-w-md ${compact ? "h-24 overflow-hidden" : ""}`}>
          <RainbowHeader className="block" />
        </div>
        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-md items-end gap-3 px-4 pb-2">
          {settings.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small uploaded data: URL, nothing to optimise
            <img
              src={settings.logoDataUrl}
              alt=""
              className="size-14 rounded-2xl border-2 border-paper bg-paper object-contain sticker"
            />
          ) : null}
          <div className="rounded-2xl bg-paper/90 px-3 py-1.5 backdrop-blur-sm">
            <p className="font-display text-xl leading-tight font-extrabold">{settings.schoolName}</p>
            {settings.schoolPlace ? <p className="text-sm leading-tight text-muted">{settings.schoolPlace}</p> : null}
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-md flex-1 px-4 pt-5 pb-8">{children}</main>

      <footer className="relative mx-auto w-full max-w-md px-4 pb-8 text-center">
        <WavyDivider className="mb-4" />
        {settings.officePhone ? (
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            <AnchorButton href={`tel:${settings.officePhone}`} variant="secondary" size="sm">
              <span aria-hidden="true">📞</span> {t.office.call}
            </AnchorButton>
            <AnchorButton
              href={`https://wa.me/${waNumber(settings.officePhone)}`}
              variant="leaf"
              size="sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">💬</span> {t.office.whatsapp}
            </AnchorButton>
          </div>
        ) : null}
        <p className="text-sm text-muted">
          {settings.officePhone ? `School office: ${formatPhone(settings.officePhone)} · ` : ""}
          {t.my.indiaTime}
        </p>
      </footer>
    </div>
  );
}
