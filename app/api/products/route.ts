import { type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// GET /api/products → fetchData()
// レスポンス形式: { [productId]: productObject } （GAS 互換）
export async function GET() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, json');

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  const products: Record<string, unknown> = {};
  for (const row of data ?? []) {
    const productId = row.product_id;
    const obj = row.json as Record<string, unknown> | null;
    if (productId && obj && obj.id) {
      products[productId] = obj;
    }
  }

  return Response.json(products);
}

// POST /api/products → saveProductFromUi(selectedProduct)
// body: 商品オブジェクト（selectedProduct.id が必須）
export async function POST(request: NextRequest) {
  let selectedProduct: Record<string, unknown>;
  try {
    selectedProduct = await request.json();
  } catch {
    return Response.json({ status: 'error', message: 'リクエストボディが不正です' }, { status: 400 });
  }

  const pid = String(selectedProduct.id ?? '').trim();
  if (!pid) {
    return Response.json({ status: 'error', message: 'productId がありません' }, { status: 400 });
  }

  const pname = String(selectedProduct.name ?? '').trim();

  const { error } = await supabase
    .from('products')
    .upsert(
      {
        product_id: pid,
        product_name: pname,
        json: selectedProduct,
      },
      { onConflict: 'product_id' }
    );

  if (error) {
    return Response.json({ status: 'error', message: error.message }, { status: 500 });
  }

  return Response.json({ status: 'success' });
}

// DELETE /api/products?productId=xxx → deleteProductFromUi(productId)
export async function DELETE(request: NextRequest) {
  const pid = String(request.nextUrl.searchParams.get('productId') ?? '').trim();
  if (!pid) {
    return Response.json({ ok: false, message: 'productId が不正です' }, { status: 400 });
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('product_id', pid);

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  // GAS 実装と同様: 存在しなくても ok: true を返す
  return Response.json({ ok: true });
}
