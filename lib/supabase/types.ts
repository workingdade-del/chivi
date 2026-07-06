export type ProductCategory = "plats_chivi" | "plats_traditionnels" | "boissons";
export type OrderStatus = "recue" | "en_preparation" | "prete" | "en_route" | "livree" | "annulee";
export type PaymentMethod = "cash_livraison" | "momo_livraison" | "momo_avance";
export type PaymentStatus = "en_attente" | "paye";
export type DriverStatus = "libre" | "en_course";
export type AssignmentStatus = "assignee" | "en_cours" | "livree";
export type ExpenseCategory = "ingredients" | "emballage" | "transport" | "personnel" | "autre";
export type WhatsappDirection = "inbound" | "outbound";

type Table<Row, RequiredInsert extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          whatsapp_phone: string;
          full_name: string | null;
          email: string | null;
          zone: string | null;
          address_details: string | null;
          delivery_lat: number | null;
          delivery_lng: number | null;
          ai_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "whatsapp_phone"
      >;
      products: Table<
        {
          id: string;
          name: string;
          description: string | null;
          category: ProductCategory;
          base_price: number;
          image_path: string | null;
          is_new: boolean;
          is_available: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        "name" | "category" | "base_price"
      >;
      product_variants: Table<
        {
          id: string;
          product_id: string;
          group_label: string;
          name: string;
          price: number;
          is_available: boolean;
          sort_order: number;
        },
        "product_id" | "name" | "price"
      >;
      supplements: Table<
        {
          id: string;
          name: string;
          price: number;
          is_available: boolean;
          sort_order: number;
        },
        "name" | "price"
      >;
      delivery_zones: Table<
        {
          id: string;
          name: string;
          min_km: number;
          max_km: number;
          fee_min: number;
          fee_max: number;
          sort_order: number;
        },
        "name" | "min_km" | "max_km" | "fee_min" | "fee_max"
      >;
      drivers: Table<
        {
          id: string;
          name: string;
          phone: string;
          status: DriverStatus;
          is_active: boolean;
          is_available: boolean;
          last_seen: string | null;
          photo_url: string | null;
          created_at: string;
        },
        "name" | "phone"
      >;
      orders: Table<
        {
          id: string;
          order_number: string;
          profile_id: string | null;
          status: OrderStatus;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
          subtotal: number;
          delivery_fee: number;
          total: number;
          delivery_address: string | null;
          delivery_lat: number | null;
          delivery_lng: number | null;
          delivery_zone_id: string | null;
          client_note: string | null;
          created_at: string;
          updated_at: string;
        },
        "payment_method" | "subtotal" | "delivery_fee" | "total"
      >;
      order_items: Table<
        {
          id: string;
          order_id: string;
          product_id: string | null;
          product_variant_id: string | null;
          product_name: string;
          variant_name: string | null;
          unit_price: number;
          quantity: number;
          line_total: number;
          note: string | null;
        },
        "order_id" | "product_name" | "unit_price" | "line_total"
      >;
      order_supplements: Table<
        {
          id: string;
          order_item_id: string;
          supplement_id: string | null;
          supplement_name: string;
          unit_price: number;
          quantity: number;
        },
        "order_item_id" | "supplement_name" | "unit_price"
      >;
      order_assignments: Table<
        {
          id: string;
          order_id: string;
          driver_id: string;
          assigned_at: string;
          delivered_at: string | null;
          status: AssignmentStatus;
        },
        "order_id" | "driver_id"
      >;
      expenses: Table<
        {
          id: string;
          label: string;
          category: ExpenseCategory;
          amount: number;
          quantity: number | null;
          unit_price: number | null;
          expense_date: string;
          note: string | null;
          created_at: string;
        },
        "label" | "amount"
      >;
      whatsapp_messages: Table<
        {
          id: string;
          profile_id: string | null;
          order_id: string | null;
          driver_id: string | null;
          wa_message_id: string | null;
          direction: WhatsappDirection;
          phone: string;
          message_type: string;
          content: string | null;
          payload: Record<string, unknown> | null;
          created_at: string;
        },
        "direction" | "phone"
      >;
      system_settings: Table<
        {
          id: boolean;
          is_paused: boolean;
          pause_reason: string | null;
          paused_at: string | null;
          paused_by: string | null;
        },
        "id"
      >;
      inventory_items: Table<
        {
          id: string;
          name: string;
          quantity: number;
          unit: string;
          alert_threshold: number;
          unit_price: number;
          created_at: string;
          updated_at: string;
        },
        "name"
      >;
      product_costs: Table<
        {
          product_id: string;
          ingredient_cost: number;
          packaging_cost: number;
          total_cost: number;
          notes: string | null;
          updated_at: string;
        },
        "product_id"
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
