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
  ship1F?: number | string;
  ship2F?: number | string;
  sample?: number | string;
  partnerNo?: number | string;
  [key: string]: unknown;
};

type Product = {
  name?: string;
  rows?: ProductRow[];
  [key: string]: unknown;
};

// POST /api/export/partner-shipments → exportSelectedPartnerShipmentsCsv(payload)
// body: { partnerNo, dateFrom?, dateTo? }
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: 'リクエストボディが不正です' }, { status: 400 });
  }

  const partnerNo = Number(payload.partnerNo ?? 0);
  if (!partnerNo) {
    return Response.json({ ok: false, message: 'partnerNo が不正です' }, { status: 400 });
  }

  const dateFrom = payload.dateFrom ? String(payload.dateFrom) : null;
  const dateTo = payload.dateTo ? String(payload.dateTo) : null;

  // 取引先名を取得
  const { data: partnerData } = await supabase
    .from('partners')
    .select('name')
    .eq('no', partnerNo)
    .single();

  const partnerName = partnerData?.name ?? '';

  // 全商品の json を取得
  const { data: productsData, error } = await supabase
    .from('products')
    .select('json');

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  const lines: string[] = [];
  lines.push(['日付', '商品名', '受注(本)', 'サンプル(本)', '合計(本)', '取引先No', '店名'].join(','));

  for (const row of productsData ?? []) {
    const prod = row.json as Product | null;
    if (!prod) continue;

    const sortedRows = ([...(prod.rows ?? [])] as ProductRow[]).sort((a, b) =>
      String(a.date ?? '').localeCompare(String(b.date ?? ''), 'ja')
    );

    for (const r of sortedRows) {
      const d = String(r.date ?? '');
      if (!d) continue;
      if (dateFrom && d < dateFrom) continue;
      if (dateTo && d > dateTo) continue;
      if (Number(r.partnerNo ?? 0) !== partnerNo) continue;

      const order = (Number(r.ship1F) || 0) + (Number(r.ship2F) || 0);
      const sample = Number(r.sample) || 0;
      const total = order + sample;
      if (total === 0) continue;

      lines.push(
        [
          d.replace(/-/g, '/'),
          csvEscape(prod.name ?? ''),
          order,
          sample,
          total,
          partnerNo,
          csvEscape(partnerName),
        ].join(',')
      );
    }
  }

  // BOM 付き UTF-8 → base64
  const csv = '\uFEFF' + lines.join('\n');
  const base64 = Buffer.from(csv, 'utf-8').toString('base64');
  const filename = `shipments_partner_${partnerNo}.csv`;

  return Response.json({ ok: true, filename, base64 });
}
