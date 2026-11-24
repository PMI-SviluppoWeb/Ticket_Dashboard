import { notFound } from "next/navigation";
import { getRapportino } from "@/lib/rapportini";
import RapportinoDettaglio from "@/components/RapportinoDettaglio";

export const dynamic = "force-dynamic";

export default async function RapportinoPage({
  params,
}: {
  params: { id: string };
}) {
  const rapportino = await getRapportino(params.id);
  if (!rapportino) notFound();
  return <RapportinoDettaglio rapportino={rapportino} />;
}
