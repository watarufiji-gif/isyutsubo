import { type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// GAS の normalizePartnerType_ に相当
function normalizePartnerType(v: unknown): 'export' | 'domestic' {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'export' || s === '輸出') return 'export';
  return 'domestic';
}

type PartnerRow = {
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
};

// DB の snake_case → GAS 互換の camelCase に変換
function toApiPartner(row: PartnerRow) {
  return {
    no: row.no,
    name: row.name ?? '',
    country: row.country ?? '',
    prefecture: row.prefecture ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    person: row.person ?? '',
    remarks: row.remarks ?? '',
    claims: row.claims ?? '',
    lost: row.lost,
    partnerType: normalizePartnerType(row.partner_type),
    exportCountry: row.export_country ?? '',
    mapConditionReleased: row.map_condition_released,
  };
}

// GET /api/partners → getPartners()
export async function GET() {
  const { data, error } = await supabase
    .from('partners')
    .select(
      'no, name, country, prefecture, address, phone, person, remarks, claims, lost, partner_type, export_country, map_condition_released'
    )
    .order('no', { ascending: true });

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  return Response.json((data ?? []).map(toApiPartner));
}

// POST /api/partners → addPartner(payload)
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: 'リクエストボディが不正です' }, { status: 400 });
  }

  const name = String(payload.name ?? '').trim();
  if (!name) {
    return Response.json({ ok: false, message: '名称が空です' }, { status: 400 });
  }

  const partnerType = normalizePartnerType(payload.partnerType);
  const exportCountry = String(payload.exportCountry ?? '').trim();
  const mapConditionReleased = !!payload.mapConditionReleased;

  const { data, error } = await supabase
    .from('partners')
    .insert({
      name,
      country: String(payload.country ?? 'Japan'),
      prefecture: String(payload.prefecture ?? '') || null,
      address: String(payload.address ?? '') || null,
      phone: String(payload.phone ?? '') || null,
      person: String(payload.person ?? '') || null,
      remarks: String(payload.remarks ?? '') || null,
      claims: String(payload.claims ?? '') || null,
      lost: !!payload.lost,
      partner_type: partnerType,
      export_country: partnerType === 'export' ? exportCountry || null : null,
      map_condition_released: partnerType === 'export' ? mapConditionReleased : false,
    })
    .select('no')
    .single();

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, no: data.no });
}

// PUT /api/partners → updatePartner(payload)
export async function PUT(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, message: 'リクエストボディが不正です' }, { status: 400 });
  }

  const no = Number(payload.no ?? 0);
  if (!no) {
    return Response.json({ ok: false, message: 'Noが不正です' }, { status: 400 });
  }

  const name = String(payload.name ?? '').trim();
  if (!name) {
    return Response.json({ ok: false, message: '名称が空です' }, { status: 400 });
  }

  const partnerType = normalizePartnerType(payload.partnerType);
  const exportCountry = String(payload.exportCountry ?? '').trim();
  const mapConditionReleased = !!payload.mapConditionReleased;

  const { data, error } = await supabase
    .from('partners')
    .update({
      name,
      country: String(payload.country ?? 'Japan'),
      prefecture: String(payload.prefecture ?? '') || null,
      address: String(payload.address ?? '') || null,
      phone: String(payload.phone ?? '') || null,
      person: String(payload.person ?? '') || null,
      remarks: String(payload.remarks ?? '') || null,
      claims: String(payload.claims ?? '') || null,
      lost: !!payload.lost,
      partner_type: partnerType,
      export_country: partnerType === 'export' ? exportCountry || null : null,
      map_condition_released: partnerType === 'export' ? mapConditionReleased : false,
    })
    .eq('no', no)
    .select('no');

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ ok: false, message: '指定の取引先が見つかりません' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

// DELETE /api/partners?no=1 → deletePartner(no)
export async function DELETE(request: NextRequest) {
  const no = Number(request.nextUrl.searchParams.get('no') ?? 0);
  if (!no) {
    return Response.json({ ok: false, message: 'Noが不正です' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('partners')
    .delete()
    .eq('no', no)
    .select('no');

  if (error) {
    return Response.json({ ok: false, message: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return Response.json({ ok: false, message: '指定の取引先が見つかりません' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
