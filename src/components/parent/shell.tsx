import type { ReactNode } from "react";
import { Doodles, WavyDivider } from "@/components/art";
import { DeveloperCredit } from "@/components/credit";
import { BrandHeader } from "@/components/parent/brand-header";
import { AnchorButton } from "@/components/ui/button";
import { formatPhone, waNumber } from "@/domain/phone";
import type { AppSettings } from "@/lib/settings";
import { t } from "@/lib/strings";

/** Page frame for parents: logo header, content, office contact. */
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
      <div className="pointer-events-none absolute inset-x-0 top-72 mx-auto max-w-md" aria-hidden="true">
        <Doodles />
      </div>
      <BrandHeader schoolName={settings.schoolName} tagline={settings.schoolPlace} compact={compact} />

      <main className="safe-x relative mx-auto w-full max-w-md flex-1 pt-5 pb-8">{children}</main>

      <footer className="safe-x safe-bottom relative mx-auto w-full max-w-md text-center">
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
        <DeveloperCredit className="mt-2" />
      </footer>
    </div>
  );
}
