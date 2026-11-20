import Link from "next/link";
import { OopsArt } from "@/components/art";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-4 text-center">
      <div>
        <div className="flex justify-center">
          <OopsArt size={180} />
        </div>
        <h1 className="mt-2 text-3xl font-extrabold">We couldn&apos;t find that page</h1>
        <p className="mt-1 text-muted">The link may be old. Start again from the front page.</p>
        <Link href="/" className={buttonClass({ className: "mt-4" })}>
          Go to the front page
        </Link>
      </div>
    </main>
  );
}
