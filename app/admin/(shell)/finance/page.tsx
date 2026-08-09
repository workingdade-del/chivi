import { getFinanceAccounts } from "@/lib/finance";
import { FinanceAccountsScreen } from "@/components/admin/FinanceAccountsScreen";

export default async function AdminFinancePage() {
  const accounts = await getFinanceAccounts();
  // Soldes recalculés en temps réel à partir des transactions (jamais figés) —
  // voir lib/finance.ts::getFinanceAccounts. "Dettes" en est exclu du solde
  // net : c'est de l'argent dû, pas de la trésorerie disponible.
  const soldeNet = accounts.filter((a) => a.type !== "dettes").reduce((s, a) => s + a.balance, 0);
  const totalDettes = accounts.filter((a) => a.type === "dettes").reduce((s, a) => s + a.balance, 0);
  return <FinanceAccountsScreen accounts={accounts} soldeNet={soldeNet} totalDettes={totalDettes} />;
}
