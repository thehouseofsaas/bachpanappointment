import { connection } from "next/server";
import { SearchingArt } from "@/components/art";
import { MeetingBanner } from "@/components/parent/meeting-banner";
import { PhoneForm } from "@/components/parent/phone-form";
import { ParentShell } from "@/components/parent/shell";
import { Card } from "@/components/ui/bits";
import { Button, LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { currentMeetings } from "@/domain/parent-view";
import { phoneTail } from "@/domain/phone";
import { currentParentPhone } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { t } from "@/lib/strings";
import { signOut } from "@/app/(parent)/actions";

/** The page a parent lands on from the WhatsApp link. */
export async function Landing({ slug }: { slug?: string }) {
  await connection();
  const db = getDb();
  const [settings, all, phone] = await Promise.all([getSettings(db), currentMeetings(db), currentParentPhone()]);
  // A link to one meeting shows that meeting first.
  const meetings = slug ? [...all].sort((a, b) => Number(b.slug === slug) - Number(a.slug === slug)) : all;

  return (
    <ParentShell settings={settings}>
      <h1 className="text-3xl font-extrabold">{t.landing.hello}</h1>
      <p className="mt-1 text-lg text-muted">{t.landing.lead}</p>

      <div className="mt-4 space-y-3">
        {meetings.length === 0 ? (
          <Card className="flex items-center gap-3">
            <SearchingArt size={96} />
            <div>
              <p className="font-display text-lg font-bold">{t.landing.noMeeting}</p>
              <p className="text-muted">{t.landing.noMeetingHelp}</p>
            </div>
          </Card>
        ) : (
          meetings.map((m) => <MeetingBanner key={m.id} meeting={m} />)
        )}
      </div>

      <Card className="mt-5">
        {phone ? (
          <div className="space-y-3">
            <p className="font-display text-xl font-extrabold">{t.landing.welcomeBack}</p>
            <LinkButton href="/my" size="lg" full>
              {t.landing.continueAs(phoneTail(phone))} <span aria-hidden="true">→</span>
            </LinkButton>
            <form action={signOut}>
              <Button type="submit" variant="quiet" size="sm" full>
                {t.landing.switchNumber}
              </Button>
            </form>
          </div>
        ) : (
          <PhoneForm askAdmissionNo={settings.requireAdmissionNo} />
        )}
      </Card>

      <p className="mt-4 text-center text-sm text-muted">🔒 {settings.privacyNote}</p>
    </ParentShell>
  );
}
