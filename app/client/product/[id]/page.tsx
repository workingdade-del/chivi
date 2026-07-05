import { notFound } from "next/navigation";
import { getProduct, getSupplements } from "@/lib/menu";
import { ProductScreen } from "@/components/client/ProductScreen";

export default async function ProductPage({ params }: { params: { id: string } }) {
  const [product, supplements] = await Promise.all([getProduct(params.id), getSupplements()]);

  if (!product) notFound();

  return <ProductScreen product={product} supplements={supplements} />;
}
