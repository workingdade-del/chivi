import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptFlowRequest, encryptFlowResponse, type FlowRequestBody } from "@/lib/flow-encryption";
import { formatFcfa } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/product-categories";
import type { ProductCategory } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface CartLine {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  supplementIds: string[];
  supplementNames: string[];
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

interface CartState {
  lines: CartLine[];
  currentCategory: ProductCategory | null;
}

const EMPTY_CART: CartState = { lines: [], currentCategory: null };

async function saveCart(flowToken: string, phone: string, cart: CartState) {
  const supabase = createServiceClient();
  await supabase
    .from("flow_sessions")
    .upsert({ flow_token: flowToken, phone, cart: cart as unknown, updated_at: new Date().toISOString() }, { onConflict: "flow_token" });
}

function cartSummaryText(cart: CartState): string {
  if (cart.lines.length === 0) return "Ton panier est vide.";
  return cart.lines
    .map((l) => {
      const options = [l.variantName, ...l.supplementNames].filter(Boolean).join(", ");
      return `${l.quantity}× ${l.productName}${options ? ` (${options})` : ""} — ${formatFcfa(l.lineTotal)}`;
    })
    .join("\n");
}

function cartSubtotal(cart: CartState): number {
  return cart.lines.reduce((s, l) => s + l.lineTotal, 0);
}

async function handleAction(payload: {
  action: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();
  const flowToken = payload.flow_token ?? "";

  if (payload.action === "INIT") {
    const categories = Object.entries(CATEGORY_LABELS).map(([id, title]) => ({ id, title }));
    return { screen: "CATEGORIES", data: { categories } };
  }

  const trigger = (payload.data?.trigger as string) ?? "";

  if (trigger === "select_category") {
    const categoryId = payload.data?.category_id as ProductCategory;
    const { data: products } = await supabase
      .from("products")
      .select("id, name, description")
      .eq("category", categoryId)
      .eq("is_available", true)
      .order("sort_order");

    const { data: session } = await supabase
      .from("flow_sessions")
      .select("cart, phone")
      .eq("flow_token", flowToken)
      .maybeSingle();
    if (session) {
      const cart = ((session.cart as unknown as CartState) ?? EMPTY_CART);
      cart.currentCategory = categoryId;
      await saveCart(flowToken, session.phone, cart);
    }

    return {
      screen: "PRODUCT_LIST",
      data: {
        category_name: CATEGORY_LABELS[categoryId] ?? "Menu",
        products: (products ?? []).map((p) => ({ id: p.id, title: p.name, description: p.description ?? "" })),
      },
    };
  }

  if (trigger === "select_product") {
    const productId = payload.data?.product_id as string;
    const [{ data: product }, { data: variants }, { data: supplements }] = await Promise.all([
      supabase.from("products").select("id, name, description, base_price").eq("id", productId).maybeSingle(),
      supabase
        .from("product_variants")
        .select("id, name, price")
        .eq("product_id", productId)
        .eq("is_available", true)
        .order("sort_order"),
      supabase.from("supplements").select("id, name, price").eq("is_available", true).order("sort_order"),
    ]);

    const hasVariants = Boolean(variants?.length);
    const quantities = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), title: String(i + 1) }));

    return {
      screen: "PRODUCT_DETAIL",
      data: {
        product_id: productId,
        product_name: product?.name ?? "",
        product_description: product?.description ?? "",
        product_price_label: `À partir de ${formatFcfa(product?.base_price ?? 0)}`,
        has_variants: hasVariants,
        variants: hasVariants ? variants!.map((v) => ({ id: v.id, title: `${v.name} — ${formatFcfa(v.price)}` })) : [],
        has_supplements: Boolean(supplements?.length),
        supplements: (supplements ?? []).map((s) => ({ id: s.id, title: `${s.name} (+${formatFcfa(s.price)})` })),
        quantities,
      },
    };
  }

  if (trigger === "add_to_cart") {
    const productId = payload.data?.product_id as string;
    const variantId = (payload.data?.variant as string) || null;
    const supplementIds = (payload.data?.supplements as string[]) ?? [];
    const quantity = parseInt((payload.data?.quantity as string) ?? "1", 10) || 1;

    const { data: session } = await supabase
      .from("flow_sessions")
      .select("cart, phone")
      .eq("flow_token", flowToken)
      .maybeSingle();
    const cart: CartState = (session?.cart as unknown as CartState) ?? { ...EMPTY_CART };
    const phone = session?.phone ?? "";

    const [{ data: product }, { data: variant }, { data: supplements }] = await Promise.all([
      supabase.from("products").select("id, name, base_price").eq("id", productId).maybeSingle(),
      variantId
        ? supabase.from("product_variants").select("id, name, price").eq("id", variantId).maybeSingle()
        : Promise.resolve({ data: null }),
      supplementIds.length
        ? supabase.from("supplements").select("id, name, price").in("id", supplementIds)
        : Promise.resolve({ data: [] as { id: string; name: string; price: number }[] }),
    ]);

    const unitPrice = variant?.price ?? product?.base_price ?? 0;
    const supplementsTotal = (supplements ?? []).reduce((s, x) => s + x.price, 0);
    const lineTotal = (unitPrice + supplementsTotal) * quantity;

    cart.lines.push({
      productId,
      productName: product?.name ?? "Produit",
      variantId,
      variantName: variant?.name ?? null,
      supplementIds,
      supplementNames: (supplements ?? []).map((s) => s.name),
      unitPrice,
      quantity,
      lineTotal,
    });

    await saveCart(flowToken, phone, cart);

    return {
      screen: "CART",
      data: {
        cart_summary: cartSummaryText(cart),
        subtotal_label: `Sous-total : ${formatFcfa(cartSubtotal(cart))}`,
        has_items: cart.lines.length > 0,
      },
    };
  }

  console.warn("[flow-data] unrecognized trigger/action", { action: payload.action, trigger, screen: payload.screen });
  return { screen: payload.screen ?? "CATEGORIES", data: {} };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as FlowRequestBody;

  let decrypted;
  try {
    decrypted = decryptFlowRequest(body);
  } catch (err) {
    console.error("[flow-data] decryption FAILED", err);
    // 421 signale à Meta un problème de déchiffrement (ex: rotation de clé nécessaire).
    return new NextResponse(null, { status: 421 });
  }

  const { payload, aesKey, iv } = decrypted;

  if (payload.action === "ping") {
    const encrypted = encryptFlowResponse({ version: payload.version, data: { status: "active" } }, aesKey, iv);
    return new NextResponse(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  try {
    const responseData = await handleAction(payload);
    const encrypted = encryptFlowResponse({ version: payload.version, ...responseData }, aesKey, iv);
    return new NextResponse(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    console.error("[flow-data] action handling FAILED", err);
    const encrypted = encryptFlowResponse(
      { version: payload.version, data: { error_message: "Une erreur est survenue, réessaie." } },
      aesKey,
      iv
    );
    return new NextResponse(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
}
