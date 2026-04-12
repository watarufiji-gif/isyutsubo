import { type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// GAS の csvEscape_ に相当
function csvEscape(s: unknown): string {
  const v = String(s ?? '');
  if (/[,"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

type ProductRow = {
  date?: string;
  tsumeguchi?: number | string;
  ship1F?: number | string;  // 卸
  ship2F?: number | string;  // 小売
  gift?: number | string;
  sample?: number | string;
  damage?: number | string;
  analysis?: number | string;
  cork?: number | string;    // 不良（在庫計算には含まない）
  partnerNo?: number | string;
  remarks?: string;
  staff?: string;
  [key: string]: unknown;
};

type Product = {
  id?: string;
  name?: string;
  rows?: ProductRow[];
  [key: string]: unknown;
};

// POST /api/export/inventory → exportInventoryCsv(payload)
// body: { productId, dateFrom?, dateTo? }
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: 'リクエストボディが不正です' }, { status: 400 });
  }

  const productId = String(payload.productId ?? '').trim();
  if (!productId) {
    return Response.json({ ok: false, message: 'productId が不正です' }, { status: 400 });
  }

  const dateFrom = payload.dateFrom ? String(payload.dateFrom) : null;
  const dateTo = payload.dateTo ? String(payload.dateTo) : null;

  const { data, error } = await supabase
    .from('products')
    .select('json, product_name')
    .eq('product_id', productId)
    .single();

  if (error || !data) {
    return Response.json({ ok: false, message: '商品が見つかりません' }, { status: 404 });
  }

  const prod = data.json as Product | null;
  if (!prod) {
    return Response.json({ ok: false, message: '商品データが空です' }, { status: 404 });
  }

  const rows = ([...(prod.rows ?? [])] as ProductRow[]).sort((a, b) =>
    String(a.date ?? '').localeCompare(String(b.date ?? ''), 'ja')
  );

  const lines: string[] = [];
  lines.push(
    ['日付', '詰口', '販売在庫', '卸', '小売', '贈与', 'サンプル', '合計', '破損', '分析', '不良', '取引先No', '備考', '担当者'].join(',')
  );

  let stock = 0;

  for (const r of rows) {
    const d = String(r.date ?? '');
    if (!d) continue;
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;

    const inQty = Number(r.tsumeguchi ?? 0);
    const wh = Number(r.ship1F ?? 0);
    const rt = Number(r.ship2F ?? 0);
    const gift = Number(r.gift ?? 0);
    const sample = Number(r.sample ?? 0);
    const damage = Number(r.damage ?? 0);
    const analysis = Number(r.analysis ?? 0);
    const cork = Number(r.cork ?? 0);

    const shipTotal = wh + rt + gift + sample;
    const outTotal = shipTotal + damage + analysis;
    // GAS と同様: cork は表示するが在庫計算には含まない
    stock = stock + inQty - outTotal;

    lines.push(
      [
        d.replace(/-/g, '/'),
        inQty,
        stock,
        wh,
        rt,
        gift,
        sample,
        shipTotal,
        damage,
        analysis,
        cork,
        Number(r.partnerNo ?? 0),
        csvEscape(r.remarks ?? ''),
        csvEscape(r.staff ?? ''),
      ].join(',')
    );
  }

  // BOM 付き UTF-8 → base64（GAS の Utilities.base64Encode と同等）
  const csv = '\uFEFF' + lines.join('\n');
  const base64 = Buffer.from(csv, 'utf-8').toString('base64');

  const safeName = String(prod.name ?? 'product').replace(/[\\\/:*?"<>|]/g, '_');
  const filename = `inventory_${safeName}.csv`;

  return Response.json({ ok: true, filename, base64 });
}
