import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminFrame, AdminLoading, Flash } from "@/components/admin/frame";
import { MeetingForm } from "@/components/admin/meeting-form";
import { getDb } from "@/db/client";
import { addDays, istDate } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { createMeetingAction } from "../actions";
import { sectionOptions } from "../sections";

export const metadata: Metadata = { title: "New meeting" };

export default function Page({ searchParams }: PageProps<"/admin/meetings/new">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/meetings/new">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const [sections, settings] = await Promise.all([sectionOptions(db), getSettings(db)]);
  const today = istDate(new Date());
  return (
    <AdminFrame admin={admin} title="New meeting" current="/admin/meetings" back={{ href: "/admin/meetings", label: "Meetings" }}>
      <Flash ok={sp.ok} error={sp.error} />
      <MeetingForm
        action={createMeetingAction}
        submitLabel="Save as draft"
        minDate={today}
        sections={sections}
        values={{
          title: "Parent-Teacher Meeting",
          date: addDays(today, 7),
          start: "09:00",
          end: "12:00",
          slotMinutes: settings.defaultSlotMinutes,
          gapMinutes: 0,
          breakStart: "",
          breakEnd: "",
          venue: "",
          parentNote: "",
          opens: "",
          closes: "",
          sectionIds: sections.map((s) => s.id),
        }}
      />
    </AdminFrame>
  );
}
