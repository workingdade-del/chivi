import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderDetail, getDrivers } from "@/lib/admin";
import { OrderDetailScreen } from "@/components/admin/OrderDetailScreen";

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const [order, drivers] = await Promise.all([getOrderDetail(params.id), getDrivers()]);
  if (!order) notFound();

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-2 text-maroon font-semibold text-[13px] mb-4">
        ‹ Retour aux commandes
      </Link>
      <OrderDetailScreen order={order} drivers={drivers} />
    </div>
  );
}
