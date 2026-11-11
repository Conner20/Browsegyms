import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasAdminAccessByEmail } from '@/lib/admin';

type OpenFoodFactsProduct = {
    product_name?: string;
    product_name_en?: string;
    serving_quantity?: number | string;
    nutriments?: Record<string, number | string | undefined>;
};

function finiteNumber(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function GET(_request: Request, context: { params: Promise<{ barcode: string }> }) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email || !(await hasAdminAccessByEmail(email))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { barcode } = await context.params;
    if (!/^\d{8,14}$/.test(barcode)) {
        return NextResponse.json({ error: 'Invalid barcode.' }, { status: 400 });
    }

    try {
        const response = await fetch(
            `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,serving_quantity,nutriments`,
            { cache: 'no-store', signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);

        const payload = await response.json() as { status?: number; product?: OpenFoodFactsProduct };
        if (payload.status !== 1 || !payload.product) {
            return NextResponse.json({ error: 'Product not found. Enter its nutrition information manually.' }, { status: 404 });
        }

        const product = payload.product;
        const nutrients = product.nutriments ?? {};
        const grams = finiteNumber(product.serving_quantity) ?? 100;
        const perServingOrScaled = (key: string) => {
            const serving = finiteNumber(nutrients[`${key}_serving`]);
            if (serving !== null) return serving;
            const per100g = finiteNumber(nutrients[`${key}_100g`]);
            return per100g === null ? null : per100g * grams / 100;
        };
        const kcal = perServingOrScaled('energy-kcal');
        const protein = perServingOrScaled('proteins');
        const carbs = perServingOrScaled('carbohydrates');
        const fat = perServingOrScaled('fat');

        if ([kcal, protein, carbs, fat].every(value => value === null)) {
            return NextResponse.json({ error: 'Nutrition facts were not available for this product.' }, { status: 404 });
        }

        return NextResponse.json({
            name: product.product_name_en?.trim() || product.product_name?.trim() || '',
            grams,
            kcal,
            protein,
            carbs,
            fat,
        });
    } catch (error) {
        console.error('Barcode nutrition lookup failed', error);
        return NextResponse.json({ error: 'Unable to look up that barcode. Try again or enter it manually.' }, { status: 502 });
    }
}
