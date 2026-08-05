import Link from "next/link";
import { notFound } from "next/navigation";
import { getFinanceAccountDetail, getFinanceAccounts } from "@/lib/finance";
import { FinanceAccountDetailScreen } from "@/components/admin/FinanceAccountDetailScreen";

export default async function AdminFinanceAccountPage({ params }: { params: { id: string } }) {
  const [detail, accounts] = await Promise.all([getFinanceAccountDetail(params.id), getFinanceAccounts()]);
  if (!detail.account) notFound();

  const otherAccounts = accounts.filter((a) => a.id !== params.id).map((a) => ({ id: a.id, name: a.name }));

  return (
    <div>
      <Link href="/admin/finance" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux comptes
      </Link>
      <FinanceAccountDetailScreen detail={detail} otherAccounts={otherAccounts} />
    </div>
  );
}
