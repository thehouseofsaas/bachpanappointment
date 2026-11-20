"use client";

import { OopsArt } from "@/components/art";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-4 text-center">
      <div>
        <div className="flex justify-center">
          <OopsArt size={180} />
        </div>
        <h1 className="mt-2 text-3xl font-extrabold">Something went wrong</h1>
        <p className="mt-1 text-muted">Nothing was changed. Please try again; if it keeps happening, call the school office.</p>
        <Button className="mt-4" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
