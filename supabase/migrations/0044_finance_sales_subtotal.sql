-- Les frais de livraison sont perçus au nom du prestataire livreur externe
-- (l'argent lui revient intégralement) : ce n'est ni un revenu ni une
-- dépense CHIVI. Le compte Ventes doit donc être crédité du sous-total de
-- la commande (denrées), pas du total incluant la livraison.
create or replace function create_sales_transaction_on_delivery()
returns trigger as $$
declare
  ventes_account_id uuid;
begin
  if new.status = 'livree' and (tg_op = 'INSERT' or old.status is distinct from 'livree') then
    select id into ventes_account_id from finance_accounts where type = 'ventes' order by created_at asc limit 1;
    if ventes_account_id is not null then
      insert into finance_transactions (account_id, type, amount, description, source_type, source_id, date)
      values (ventes_account_id, 'entree', new.subtotal, 'Commande ' || new.order_number, 'order', new.id, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
