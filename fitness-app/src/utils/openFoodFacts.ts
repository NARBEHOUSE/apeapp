import type { ParsedFood } from './usda';

export interface OFFFood extends ParsedFood {
  source: 'off';
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mapProduct(product: Record<string, unknown>, codeOverride?: string): OFFFood | null {
  const name = ((product.product_name as string) ?? '').trim();
  if (!name) return null;

  const nutriments = (product.nutriments as Record<string, number> | undefined) ?? {};
  const cal = r1(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0);
  if (cal === 0) return null;

  const rawBrands = ((product.brands as string) ?? '').trim();
  const brand = rawBrands ? rawBrands.split(',')[0].trim() : undefined;
  const code = codeOverride ?? ((product.code as string) ?? '');

  return {
    fdcId: 'off_' + code,
    name,
    brand: brand || undefined,
    caloriesPer100g: cal,
    proteinPer100g: r1(nutriments['proteins_100g'] ?? 0),
    carbsPer100g: r1(nutriments['carbohydrates_100g'] ?? 0),
    fatPer100g: r1(nutriments['fat_100g'] ?? 0),
    fiberPer100g: r1(nutriments['fiber_100g'] ?? 0),
    source: 'off',
  };
}

export async function searchOFF(query: string): Promise<OFFFood[]> {
  try {
    const url =
      `https://world.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=10` +
      `&fields=product_name,brands,nutriments,code`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: Record<string, unknown>[] };
    const products = data.products ?? [];
    const out: OFFFood[] = [];
    for (const p of products) {
      const mapped = mapProduct(p);
      if (mapped) out.push(mapped);
      if (out.length >= 8) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function lookupBarcodeOFF(barcode: string): Promise<OFFFood | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status: number; product?: Record<string, unknown> };
    if (data.status !== 1 || !data.product) return null;
    return mapProduct(data.product, barcode);
  } catch {
    return null;
  }
}
