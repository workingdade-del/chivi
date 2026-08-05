import { createClient } from "@/lib/supabase/server";

export interface FinanceAccountRow {
  id: string;
  name: string;
  type: "ventes" | "dettes" | "personnalise";
  balance: number;
  createdAt: string;
}

/** Solde calculé à la volée (jamais stocké) : somme des entrées - somme des sorties. */
export async function getFinanceAccounts(): Promise<FinanceAccountRow[]> {
  const supabase = createClient();
  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("finance_accounts").select("id, name, type, created_at").order("created_at", { ascending: true }),
    supabase.from("finance_transactions").select("account_id, type, amount"),
  ]);

  const balances = new Map<string, number>();
  for (const t of transactions ?? []) {
    const delta = t.type === "entree" ? t.amount : -t.amount;
    balances.set(t.account_id, (balances.get(t.account_id) ?? 0) + delta);
  }

  return (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balance: balances.get(a.id) ?? 0,
    createdAt: a.created_at,
  }));
}

export interface FinanceTransactionRow {
  id: string;
  type: "entree" | "sortie";
  amount: number;
  description: string | null;
  category: string | null;
  date: string;
  source_type: "order" | "expense" | "manual";
  source_id: string | null;
  created_at: string;
}

export interface FinanceAccountDetail {
  account: { id: string; name: string; type: "ventes" | "dettes" | "personnalise"; created_at: string } | null;
  transactions: FinanceTransactionRow[];
  balance: number;
}

export async function getFinanceAccountDetail(id: string): Promise<FinanceAccountDetail> {
  const supabase = createClient();
  const [{ data: account }, { data: transactions }] = await Promise.all([
    supabase.from("finance_accounts").select("id, name, type, created_at").eq("id", id).maybeSingle(),
    supabase
      .from("finance_transactions")
      .select("id, type, amount, description, category, date, source_type, source_id, created_at")
      .eq("account_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const rows = (transactions ?? []) as FinanceTransactionRow[];
  const balance = rows.reduce((s, t) => s + (t.type === "entree" ? t.amount : -t.amount), 0);

  return { account: account ?? null, transactions: rows, balance };
}
