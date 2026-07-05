import { getDeliveryZones } from "@/lib/menu";
import { LocationScreen } from "@/components/client/LocationScreen";

export default async function LocationPage() {
  const zones = await getDeliveryZones();
  return <LocationScreen zones={zones} />;
}
