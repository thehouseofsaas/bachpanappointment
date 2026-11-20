import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/admin/copy-field";
import { AdminFrame, AdminLoading } from "@/components/admin/frame";
import { getDb } from "@/db/client";
import { getMeetingDetail } from "@/domain/admin-view";
import { formatDate, formatTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Print sheets" };

export default function Page(props: PageProps<"/admin/meetings/[id]/print">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content {...props} />
    </Suspense>
  );
}

const cell = "border border-black/60 px-2 py-1.5 text-left align-top";

/** One plain A4 sheet per teacher. */
async function Content({ params }: PageProps<"/admin/meetings/[id]/print">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const [m, settings] = await Promise.all([getMeetingDetail(db, id), getSettings(db)]);
  if (!m) notFound();
  const sessions = m.sessions.filter((s) => s.active);
  return (
    <AdminFrame admin={admin} title="Print sheets" current="/admin/meetings" back={{ href: `/admin/meetings/${m.id}`, label: m.title }} actions={<PrintButton />}>
      <p className="no-print mb-4 text-muted">One page per teacher. Use your browser&apos;s print dialog; choose A4, portrait.</p>
      {sessions.map((s, i) => (
        <section key={s.id} className={`bg-white text-black ${i < sessions.length - 1 ? "mb-8 break-after-page" : ""}`}>
          <header className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded data: URL or the bundled logo */}
            <img src={settings.logoDataUrl || "/brand/bachpan-logo.png"} alt="" className="h-14 w-auto object-contain" />
            <div>
              <p className="text-sm">{settings.schoolName}</p>
              <h2 className="text-xl font-extrabold">
                {m.title} · {formatDate(m.date, "full")}
              </h2>
              <p>
                <strong>{s.teacherName}</strong> · {s.sections.map((x) => x.label).join(", ")}
                {s.room ? ` · ${s.room}` : ""} · {s.booked} booked of {s.children}
              </p>
            </div>
          </header>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${cell} w-20`}>Time</th>
                <th className={cell}>Child</th>
                <th className={`${cell} w-24`}>Class</th>
                <th className={`${cell} w-16`}>Came</th>
                <th className={`${cell} w-2/5`}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {s.slots
                .filter((x) => x.state === "open")
                .map((x) => (
                  <tr key={x.id}>
                    <td className={`${cell} whitespace-nowrap font-bold`}>{formatTime(x.startsAt)}</td>
                    <td className={cell}>{x.booking?.studentName ?? ""}</td>
                    <td className={cell}>{x.booking?.classLabel ?? ""}</td>
                    <td className={cell}>{x.booking ? "☐" : ""}</td>
                    <td className={cell}></td>
                  </tr>
                ))}
            </tbody>
          </table>
          {s.unbooked.length > 0 ? (
            <p className="mt-2 text-sm">
              <strong>Not booked ({s.unbooked.length}):</strong> {s.unbooked.map((u) => u.name).join(", ")}
            </p>
          ) : null}
        </section>
      ))}
    </AdminFrame>
  );
}
