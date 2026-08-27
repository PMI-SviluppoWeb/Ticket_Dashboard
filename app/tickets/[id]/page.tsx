"use client";

import { useParams, useRouter } from "next/navigation";
import TicketPage from "@/components/TicketPage";

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <TicketPage
      id={params.id}
      onBack={() => router.push("/")}
      onDeleted={() => router.push("/")}
    />
  );
}
