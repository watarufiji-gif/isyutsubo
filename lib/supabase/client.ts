import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ----------------------------------------
// 型定義
// ----------------------------------------

export type Partner = {
  no: number;
  name: string;
  country: string | null;
  prefecture: string | null;
  address: string | null;
  phone: string | null;
  person: string | null;
  remarks: string | null;
  claims: string | null;
  lost: boolean;
  partner_type: string | null;
  export_country: string | null;
  map_condition_released: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  product_id: string;
  product_name: string;
  json: Record<string, unknown> | null;
  updated_at: string;
};
