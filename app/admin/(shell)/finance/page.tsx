import { getFinanceAccounts } from "@/lib/finance";
import { FinanceAccountsScreen } from "@/components/admin/FinanceAccountsScreen";

export default async function AdminFinancePage() {
  const accounts = await getFinanceAccounts();
  return <FinanceAccountsScreen accounts={accounts} />;
}
