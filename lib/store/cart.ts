import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartSupplement {
  supplementId: string;
  name: string;
  price: number;
}

export interface CartLine {
  key: string;
  productId: string;
  productVariantId: string | null;
  name: string;
  variantName: string | null;
  detail: string;
  unitPrice: number;
  qty: number;
  supplements: CartSupplement[];
}

export interface DeliveryZoneChoice {
  id: string;
  name: string;
  fee: number;
}

interface CartState {
  cart: CartLine[];
  whatsappPhone: string;
  addressDetails: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryZone: DeliveryZoneChoice | null;
  paymentMethod: "cash_livraison" | "momo_livraison" | "momo_avance";
  addLine: (line: Omit<CartLine, "key">) => void;
  incLine: (key: string) => void;
  decLine: (key: string) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  setPhone: (phone: string) => void;
  setAddressDetails: (details: string) => void;
  setDeliveryPosition: (lat: number, lng: number) => void;
  setDeliveryZone: (zone: DeliveryZoneChoice) => void;
  setPaymentMethod: (method: CartState["paymentMethod"]) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: [],
      whatsappPhone: "",
      addressDetails: "",
      deliveryLat: null,
      deliveryLng: null,
      deliveryZone: null,
      paymentMethod: "cash_livraison",

      addLine: (line) =>
        set({
          cart: [...get().cart, { ...line, key: `${Date.now()}-${Math.random()}` }],
        }),
      incLine: (key) =>
        set({
          cart: get().cart.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)),
        }),
      decLine: (key) =>
        set({
          cart: get()
            .cart.map((l) => (l.key === key ? { ...l, qty: Math.max(1, l.qty - 1) } : l)),
        }),
      removeLine: (key) => set({ cart: get().cart.filter((l) => l.key !== key) }),
      clearCart: () => set({ cart: [] }),
      setPhone: (whatsappPhone) => set({ whatsappPhone }),
      setAddressDetails: (addressDetails) => set({ addressDetails }),
      setDeliveryPosition: (deliveryLat, deliveryLng) => set({ deliveryLat, deliveryLng }),
      setDeliveryZone: (deliveryZone) => set({ deliveryZone }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
    }),
    { name: "chivi-cart" }
  )
);

export function lineTotal(line: CartLine): number {
  const suppTotal = line.supplements.reduce((s, x) => s + x.price, 0);
  return (line.unitPrice + suppTotal) * line.qty;
}

export function cartSubtotal(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + lineTotal(l), 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((n, l) => n + l.qty, 0);
}
