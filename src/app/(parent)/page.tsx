import { Suspense } from "react";
import { Landing } from "@/components/parent/landing";
import { PageLoading } from "@/components/ui/page-loading";

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Landing />
    </Suspense>
  );
}
