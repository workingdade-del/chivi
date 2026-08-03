import Link from "next/link";
import { NewOrderForm } from "@/components/admin/NewOrderForm";

export default function AdminNewOrderPage() {
  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux commandes
      </Link>
      <h1 className="font-mega text-2xl text-maroon-deep mb-4">Nouvelle commande</h1>
      <NewOrderForm />
    </div>
  );
}
