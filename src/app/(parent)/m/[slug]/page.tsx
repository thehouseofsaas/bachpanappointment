import { Suspense } from "react";
import { Landing } from "@/components/parent/landing";
import { PageLoading } from "@/components/ui/page-loading";

/** Link to one meeting, e.g. the one pasted into a class WhatsApp group. */
export default function Page({ params }: PageProps<"/m/[slug]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ForSlug params={params} />
    </Suspense>
  );
}

async function ForSlug({ params }: Pick<PageProps<"/m/[slug]">, "params">) {
  const { slug } = await params;
  return <Landing slug={slug} />;
}
