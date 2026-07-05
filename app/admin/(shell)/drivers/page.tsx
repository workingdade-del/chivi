import { getDrivers } from "@/lib/admin";
import { DriversScreen } from "@/components/admin/DriversScreen";

export default async function AdminDriversPage() {
  const drivers = await getDrivers();
  return <DriversScreen initialDrivers={drivers} />;
}
