"use client";

import { useParams, useRouter } from "next/navigation";
import ProgettoPage from "@/components/ProgettoPage";

export default function ProgettoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <ProgettoPage
      id={params.id}
      onBack={() => router.push("/progetti")}
      onDeleted={() => router.push("/progetti")}
    />
  );
}
