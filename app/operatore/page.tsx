import { redirect } from "next/navigation";

// "I Miei Ticket" e' stato fuso nella dashboard: il filtro Operatore e' ora
// nella barra dei ticket e per gli operatori parte su "I miei". Il vecchio
// percorso resta come redirect per i bookmark e per i link storici.
export default function OperatorePage() {
  redirect("/");
}
