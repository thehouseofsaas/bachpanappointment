import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AllBookedArt,
  Balloon,
  ClassBadge,
  Cloud,
  Heart,
  Kite,
  OopsArt,
  Rainbow,
  RainbowHeader,
  SearchingArt,
  SleepingSunArt,
  Star,
  Sun,
  Tick,
  WavingCloudArt,
  WavyDivider,
} from "@/components/art";
import { ChildCard } from "@/components/parent/child-card";
import { Card, Field, inputClass, Notice, Pill } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page-loading";
import { BADGE_LABELS, BADGES, TONE_LABELS, TONES } from "@/theme/tones";

export const metadata: Metadata = { title: "Styleguide" };

/** Look-and-feel reference with sample data. Development only. */
export default function Styleguide() {
  if (process.env.NODE_ENV === "production") notFound();
  const slots = ["9:00 am", "9:10 am", "9:20 am", "9:40 am", "10:00 am", "10:10 am"].map((time, i) => ({
    id: `s${i}`,
    time,
    period: "morning" as const,
    hint: i === 3 ? { kind: "after" as const, text: "Right after Meher's" } : undefined,
  }));
  const base = {
    meetingTitle: "Monthly Parent-Teacher Meeting",
    dayLabel: "Saturday, 12 December",
    room: "Room 3",
    phase: "open" as const,
    phaseMessage: null,
    schoolCancelNotice: null,
    movesLeft: 3,
  };
  return (
    <div className="bg-cream">
      <div className="bg-wash">
        <div className="mx-auto max-w-md">
          <RainbowHeader className="block" />
        </div>
      </div>
      <main className="mx-auto max-w-md space-y-8 px-4 py-6">
        <header>
          <h1 className="text-4xl font-extrabold">Styleguide</h1>
          <p className="text-muted">The pre-school theme: colours, type, shapes and the parent screens with sample data.</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Colours</h2>
          <div className="grid grid-cols-3 gap-2">
            {TONES.map((tone) => (
              <div key={tone} data-tone={tone} className="overflow-hidden rounded-2xl border-2 border-tone text-sm font-bold">
                <div className="h-10 bg-tone" />
                <div className="bg-tone-soft px-2 py-1 text-tone-ink">{TONE_LABELS[tone]}</div>
                <div className="bg-paper px-2 py-1 text-tone-ink">Text Aa</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-sm font-bold">
            <span className="flex-1 rounded-xl border-2 border-line bg-cream px-2 py-2">Cream</span>
            <span className="flex-1 rounded-xl border-2 border-line bg-wash px-2 py-2">Sky wash</span>
            <span className="flex-1 rounded-xl bg-navy px-2 py-2 text-white">Navy</span>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-2xl font-extrabold">Type</h2>
          <p className="font-display text-4xl font-extrabold">10:20 am</p>
          <p className="font-display text-2xl font-extrabold">Pick a time to meet Aarav&apos;s teacher</p>
          <p className="text-lg">Body text is Nunito at 16 px or larger, so it stays readable on small phones.</p>
          <p className="text-muted">Muted text for supporting details.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Buttons</h2>
          <Button size="lg" full>
            Find my child →
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary">Not now</Button>
            <Button variant="leaf">💬 WhatsApp</Button>
            <Button variant="tone" data-tone="sky">
              Change time
            </Button>
            <Button variant="danger">Cancel booking</Button>
          </div>
          <Button disabled full>
            Disabled
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Messages and fields</h2>
          <Notice kind="good">All set! See you on Saturday.</Notice>
          <Notice kind="info">Booking opens on Mon, 7 Dec, 9:00 am.</Notice>
          <Notice kind="warn">The date of this meeting changed. Your time is kept.</Notice>
          <Notice kind="bad">Oops, that time was just taken. Here are the ones still free.</Notice>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <Pill key={tone} tone={tone}>
                {TONE_LABELS[tone]}
              </Pill>
            ))}
          </div>
          <Card>
            <Field label="Your mobile number" hint="Use the number you gave the school." htmlFor="sg-phone">
              <input id="sg-phone" className={inputClass} placeholder="98765 43210" inputMode="tel" />
            </Field>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Class badges</h2>
          <div className="grid grid-cols-4 gap-3">
            {BADGES.map((b) => (
              <div key={b} className="flex flex-col items-center gap-1 text-sm font-bold">
                <ClassBadge badge={b} size={56} />
                {BADGE_LABELS[b]}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Doodles</h2>
          <div className="flex flex-wrap items-end gap-4">
            <Rainbow size={120} />
            <Cloud face />
            <Sun />
            <Star />
            <Balloon tone="sky" />
            <Kite />
            <Heart />
            <Tick />
          </div>
          <WavyDivider />
          <div className="grid grid-cols-2 gap-3 text-center text-sm font-bold">
            <div><SleepingSunArt size={150} />Opens later</div>
            <div><WavingCloudArt size={150} />Booking closed</div>
            <div><AllBookedArt size={150} />All set</div>
            <div><OopsArt size={150} />Something went wrong</div>
            <div><SearchingArt size={150} />Number not found</div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Child cards</h2>
          <ChildCard
            {...base}
            child={{ id: "a", firstName: "Aarav", classLabel: "Nursery A", tone: "leaf", badge: "frog" }}
            teacherName="Ms. Neha Sharma"
            booking={null}
            slots={slots}
          />
          <ChildCard
            {...base}
            child={{ id: "b", firstName: "Meher", classLabel: "LKG A", tone: "sky", badge: "elephant" }}
            teacherName="Ms. Harpreet Gill"
            booking={{
              id: "x",
              time: "9:30 am",
              refCode: "K7M-4QP",
              locked: false,
              lastChanged: "Last changed from number ending 42",
              dateChanged: false,
              waUrl: "#",
              gcalUrl: "#",
              icsUrl: "#",
            }}
            slots={slots}
          />
          <ChildCard
            {...base}
            phase="closed"
            phaseMessage="Booking has closed. To book a time, please contact the school office."
            child={{ id: "c", firstName: "Noor", classLabel: "UKG A", tone: "grape", badge: "butterfly" }}
            teacherName="Ms. Anita Verma"
            booking={null}
            slots={[]}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Loading</h2>
          <div className="h-48 overflow-hidden rounded-card border-2 border-line [&>div]:min-h-48">
            <PageLoading />
          </div>
        </section>
      </main>
    </div>
  );
}
