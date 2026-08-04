import Link from "next/link";
import { NewClientForm } from "@/components/admin/NewClientForm";

export default function AdminNewClientPage() {
  return (
    <div>
      <Link href="/admin/clients" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux clients
      </Link>
      <h1 className="font-mega text-2xl text-maroon-deep mb-4">Nouveau client</h1>
      <NewClientForm />
    </div>
  );
}
