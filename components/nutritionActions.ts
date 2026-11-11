'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasAdminAccessByEmail } from '@/lib/admin';
import { db } from '@/prisma/client';

/** ---------------- Auth helper (same pattern as workoutActions) ---------------- */
async function requireMe() {
    const session = await getServerSession(authOptions);
    const sUser = session?.user as { id?: string; email?: string } | undefined;

    if (!sUser?.id && !sUser?.email) {
        throw new Error('Unauthorized');
    }
    if (!sUser.email || !(await hasAdminAccessByEmail(sUser.email))) {
        throw new Error('Forbidden');
    }

    const me = await db.user.findFirst({
        where: sUser?.id ? { id: sUser.id } : { email: sUser!.email! },
        select: { id: true },
    });

    if (!me) throw new Error('User not found');
    return me.id;
}

/** ---------------- Types used by the Nutrition Dashboard ---------------- */
export type NutritionEntryDTO = {
    id: string;
    date: string; // YYYY-MM-DD (UTC)
    meal: string;
    foodName: string;
    servings: number;
    kcal: number;
    p: number;
    c: number;
    f: number;
    time?: string | null;
    customFoodId?: string | null;
};

export type BodyweightDTO = { date: string; weight: number };

export type CustomFoodDTO = {
    id: string;
    name: string;
    grams: number;
    kcal: number;
    p: number;
    c: number;
    f: number;
};

export type MacroGoalsDTO = { kcal: number; p: number; f: number; c: number };
export type HMMetric = 'kcal' | 'f' | 'c' | 'p';
export type HeatmapLevelsDTO = Record<HMMetric, number[]>;

const DEFAULT_MACRO_GOALS: MacroGoalsDTO = { kcal: 2800, p: 200, f: 80, c: 300 };
const DEFAULT_HEATMAP_LEVELS: HeatmapLevelsDTO = {
    kcal: [0, 2200, 2600, 3000, Infinity],
    f: [0, 20, 40, 60, Infinity],
    c: [0, 60, 120, 180, Infinity],
    p: [0, 50, 100, 150, Infinity],
};

/** ---------------- Date helpers (normalize to UTC midnight) ---------------- */
function toUTCDate(dateStr: string): Date {
    // Ensure UTC midnight; avoid local TZ drift
    return new Date(dateStr + 'T00:00:00Z');
}
function toISODate(d: Date): string {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return x.toISOString().slice(0, 10);
}

const legacyMealMap: Record<string, string> = {
    breakfast: 'meal_1',
    lunch: 'meal_2',
    dinner: 'meal_3',
    snack: 'meal_4',
};

const NUMBERED_MEALS_CUTOFF = new Date('2026-11-11T05:00:00.000Z');

function loggedHour(value: string | null | undefined) {
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value?.trim() ?? '');
    if (!match) return null;
    const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return Number.isFinite(hour) ? hour : null;
}

function normalizeMealKey(value: unknown, createdAt?: Date, time?: string | null) {
    const meal = String(value ?? '').toLowerCase();
    if (legacyMealMap[meal]) return legacyMealMap[meal];
    if (meal === 'meal_1' && createdAt && createdAt < NUMBERED_MEALS_CUTOFF) {
        const hour = loggedHour(time);
        if (hour !== null) return hour < 11 ? 'meal_1' : hour < 16 ? 'meal_2' : hour < 20 ? 'meal_3' : 'meal_4';
    }
    return /^meal_[1-9]\d*$/.test(meal) ? meal : 'meal_1';
}

/** ---------------- Public API used by the Nutrition page ---------------- */
type NutritionSettingsDTO = {
    goals: MacroGoalsDTO;
    heatmapLevels: HeatmapLevelsDTO;
    mealCounts: Record<string, number>;
};

function clampGoal(value: number, min = 0, max = 10_000) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function sanitizeGoals(goals: MacroGoalsDTO): MacroGoalsDTO {
    return {
        kcal: clampGoal(goals.kcal, 0, 10_000),
        p: clampGoal(goals.p, 0, 1000),
        f: clampGoal(goals.f, 0, 1000),
        c: clampGoal(goals.c, 0, 1500),
    };
}

function encodeHeatmapLevels(levels: HeatmapLevelsDTO): Record<HMMetric, (number | null)[]> {
    const next: Record<HMMetric, (number | null)[]> = { kcal: [], f: [], c: [], p: [] } as any;
    (['kcal', 'f', 'c', 'p'] as HMMetric[]).forEach((key) => {
        const arr = Array.isArray(levels[key]) ? levels[key] : DEFAULT_HEATMAP_LEVELS[key];
        next[key] = arr.map((val) => (Number.isFinite(val) ? val : null));
    });
    return next;
}

function decodeHeatmapLevels(raw: unknown): HeatmapLevelsDTO {
    const next: HeatmapLevelsDTO = {
        kcal: [...DEFAULT_HEATMAP_LEVELS.kcal],
        f: [...DEFAULT_HEATMAP_LEVELS.f],
        c: [...DEFAULT_HEATMAP_LEVELS.c],
        p: [...DEFAULT_HEATMAP_LEVELS.p],
    };
    if (!raw || typeof raw !== 'object') return next;
    (['kcal', 'f', 'c', 'p'] as HMMetric[]).forEach((key) => {
        const arr = (raw as Record<string, unknown>)[key];
        if (Array.isArray(arr) && arr.length >= 5) {
            next[key] = arr.map((val, idx) => {
                if (idx === arr.length - 1 && (val === null || val === undefined)) return Infinity;
                return typeof val === 'number' && Number.isFinite(val) ? val : 0;
            });
            if (!Number.isFinite(next[key][next[key].length - 1])) {
                next[key][next[key].length - 1] = Infinity;
            }
        }
    });
    return next;
}

function defaultSettings(): NutritionSettingsDTO {
    return {
        goals: { ...DEFAULT_MACRO_GOALS },
        heatmapLevels: {
            kcal: [...DEFAULT_HEATMAP_LEVELS.kcal],
            f: [...DEFAULT_HEATMAP_LEVELS.f],
            c: [...DEFAULT_HEATMAP_LEVELS.c],
            p: [...DEFAULT_HEATMAP_LEVELS.p],
        },
        mealCounts: {},
    };
}

export async function fetchAllNutritionData(
    viewUserId?: string,
): Promise<{
    requiresAuth: boolean;
    entries: NutritionEntryDTO[];
    bodyweights: BodyweightDTO[];
    customFoods: CustomFoodDTO[];
    settings: NutritionSettingsDTO;
    viewingUser: { id: string; email: string | null } | null;
}> {
    let viewerId: string | null = null;
    try {
        viewerId = await requireMe();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Unauthorized' || message === 'User not found') {
            return {
                requiresAuth: true,
                viewingUser: null,
                entries: [],
                bodyweights: [],
                customFoods: [],
                settings: defaultSettings(),
            };
        }
        throw err;
    }

    const targetUserId = viewerId!;
    const viewingUser: { id: string; email: string | null } | null = null;
    void viewUserId;

    const [entries, bodyweights, customFoods, settings, daySettings] = await Promise.all([
        db.nutritionEntry.findMany({
            where: { userId: targetUserId },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            select: {
                id: true,
                date: true,
                meal: true,
                foodName: true,
                servings: true,
                kcal: true,
                p: true,
                c: true,
                f: true,
                time: true,
                customFoodId: true,
                createdAt: true,
            },
        }),
        db.bodyweightEntry.findMany({
            where: { userId: targetUserId },
            orderBy: [{ date: 'asc' }],
            select: { date: true, weight: true },
        }),
        db.nutritionCustomFood.findMany({
            where: { userId: targetUserId },
            orderBy: [{ createdAt: 'desc' }],
            select: { id: true, name: true, grams: true, kcal: true, p: true, c: true, f: true },
        }),
        db.nutritionSettings.findUnique({
            where: { userId: targetUserId },
            select: {
                goalKcal: true,
                goalProtein: true,
                goalFat: true,
                goalCarb: true,
                heatmapLevels: true,
            },
        }),
        db.nutritionDaySettings.findMany({
            where: { userId: targetUserId },
            select: { date: true, mealCount: true },
        }),
    ]);

    const mealCounts = daySettings.reduce<Record<string, number>>((counts, setting) => {
        counts[toISODate(setting.date)] = Math.max(1, setting.mealCount);
        return counts;
    }, {});
    entries.forEach((entry) => {
        const match = /^meal_(\d+)$/.exec(normalizeMealKey(entry.meal, entry.createdAt, entry.time));
        const date = toISODate(entry.date);
        mealCounts[date] = Math.max(mealCounts[date] ?? 1, match ? Number(match[1]) : 1);
    });
    const settingsDTO = settings
        ? {
            goals: {
                kcal: settings.goalKcal,
                p: settings.goalProtein,
                f: settings.goalFat,
                c: settings.goalCarb,
            },
            heatmapLevels: decodeHeatmapLevels(settings.heatmapLevels),
            mealCounts,
        }
        : { ...defaultSettings(), mealCounts };

    return {
        requiresAuth: false,
        viewingUser,
        entries: entries.map((e: typeof entries[number]) => ({
            id: e.id,
            date: toISODate(e.date),
            meal: normalizeMealKey(e.meal, e.createdAt, e.time),
            foodName: e.foodName,
            servings: e.servings,
            kcal: e.kcal,
            p: e.p,
            c: e.c,
            f: e.f,
            time: e.time,
            customFoodId: e.customFoodId ?? null,
        })),
        bodyweights: bodyweights.map((b: typeof bodyweights[number]) => ({
            date: toISODate(b.date),
            weight: b.weight,
        })),
        customFoods: customFoods.map((cf: typeof customFoods[number]) => ({
            id: cf.id,
            name: cf.name,
            grams: cf.grams,
            kcal: cf.kcal,
            p: cf.p,
            c: cf.c,
            f: cf.f,
        })),
        settings: settingsDTO,
    };
}

export async function addNutritionEntryServer(input: {
    date: string; // 'YYYY-MM-DD'
    meal: string;
    foodName: string;
    servings: number;
    kcal: number;
    p: number;
    c: number;
    f: number;
    time?: string;
    customFoodId?: string | null;
}): Promise<NutritionEntryDTO> {
    const userId = await requireMe();

    const created = await db.nutritionEntry.create({
        data: {
            userId,
            date: toUTCDate(input.date),
            meal: /^meal_[1-9]\d*$/.test(input.meal) ? input.meal : 'meal_1',
            foodName: input.foodName,
            servings: input.servings,
            kcal: input.kcal,
            p: input.p,
            c: input.c,
            f: input.f,
            time: input.time ?? null,
            customFoodId: input.customFoodId ?? null,
        },
        select: {
            id: true,
            date: true,
            meal: true,
            foodName: true,
            servings: true,
            kcal: true,
            p: true,
            c: true,
            f: true,
            time: true,
            customFoodId: true,
        },
    });

    return {
        id: created.id,
        date: toISODate(created.date),
        meal: created.meal,
        foodName: created.foodName,
        servings: created.servings,
        kcal: created.kcal,
        p: created.p,
        c: created.c,
        f: created.f,
        time: created.time,
        customFoodId: created.customFoodId ?? null,
    };
}

export async function saveMealCountServer(dateISO: string, count: number): Promise<number> {
    const userId = await requireMe();
    const mealCount = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    const settings = await db.nutritionDaySettings.upsert({
        where: { userId_date: { userId, date: toUTCDate(dateISO) } },
        update: { mealCount },
        create: { userId, date: toUTCDate(dateISO), mealCount },
        select: { mealCount: true },
    });
    return settings.mealCount;
}

export async function deleteNutritionEntryServer(id: string): Promise<{ deleted: boolean }> {
    const userId = await requireMe();

    // Ensure ownership before delete (same pattern used in workoutActions)
    const found = await db.nutritionEntry.findFirst({
        where: { id, userId },
        select: { id: true },
    });
    if (!found) return { deleted: false };

    await db.nutritionEntry.delete({ where: { id } });
    return { deleted: true };
}

export async function saveMacroGoalsServer(goals: MacroGoalsDTO): Promise<MacroGoalsDTO> {
    const userId = await requireMe();
    const clean = sanitizeGoals(goals);
    const updated = await db.nutritionSettings.upsert({
        where: { userId },
        update: {
            goalKcal: clean.kcal,
            goalProtein: clean.p,
            goalFat: clean.f,
            goalCarb: clean.c,
        },
        create: {
            userId,
            goalKcal: clean.kcal,
            goalProtein: clean.p,
            goalFat: clean.f,
            goalCarb: clean.c,
            heatmapLevels: encodeHeatmapLevels(DEFAULT_HEATMAP_LEVELS),
        },
        select: {
            goalKcal: true,
            goalProtein: true,
            goalFat: true,
            goalCarb: true,
        },
    });
    return {
        kcal: updated.goalKcal,
        p: updated.goalProtein,
        f: updated.goalFat,
        c: updated.goalCarb,
    };
}

export async function saveHeatmapLevelsServer(levels: HeatmapLevelsDTO): Promise<HeatmapLevelsDTO> {
    const userId = await requireMe();
    const sanitized: HeatmapLevelsDTO = {
        kcal: levels.kcal?.length ? levels.kcal : DEFAULT_HEATMAP_LEVELS.kcal,
        f: levels.f?.length ? levels.f : DEFAULT_HEATMAP_LEVELS.f,
        c: levels.c?.length ? levels.c : DEFAULT_HEATMAP_LEVELS.c,
        p: levels.p?.length ? levels.p : DEFAULT_HEATMAP_LEVELS.p,
    };
    const encoded = encodeHeatmapLevels(sanitized);
    const existing = await db.nutritionSettings.upsert({
        where: { userId },
        update: { heatmapLevels: encoded },
        create: {
            userId,
            heatmapLevels: encoded,
            goalKcal: DEFAULT_MACRO_GOALS.kcal,
            goalProtein: DEFAULT_MACRO_GOALS.p,
            goalFat: DEFAULT_MACRO_GOALS.f,
            goalCarb: DEFAULT_MACRO_GOALS.c,
        },
        select: { heatmapLevels: true },
    });
    return decodeHeatmapLevels(existing.heatmapLevels);
}

export async function upsertBodyweightServer(bw: {
    date: string; // 'YYYY-MM-DD'
    weight: number;
}): Promise<BodyweightDTO> {
    const userId = await requireMe();
    const date = toUTCDate(bw.date);

    const up = await db.bodyweightEntry.upsert({
        where: { userId_date: { userId, date } }, // relies on @@unique([userId, date])
        update: { weight: bw.weight },
        create: { userId, date, weight: bw.weight },
        select: { date: true, weight: true },
    });

    return { date: toISODate(up.date), weight: up.weight };
}

export async function deleteBodyweightEntryServer(dateISO: string): Promise<{ deleted: boolean }> {
    const userId = await requireMe();
    const date = toUTCDate(dateISO);
    const deleted = await db.bodyweightEntry.deleteMany({
        where: { userId, date },
    });
    return { deleted: deleted.count > 0 };
}

export async function saveCustomFoodServer(cf: {
    name: string;
    grams: number;
    kcal: number;
    p: number;
    c: number;
    f: number;
}): Promise<CustomFoodDTO> {
    const userId = await requireMe();

    const created = await db.nutritionCustomFood.create({
        data: {
            userId,
            name: cf.name,
            grams: cf.grams,
            kcal: cf.kcal,
            p: cf.p,
            c: cf.c,
            f: cf.f,
        },
        select: { id: true, name: true, grams: true, kcal: true, p: true, c: true, f: true },
    });

    return {
        id: created.id,
        name: created.name,
        grams: created.grams,
        kcal: created.kcal,
        p: created.p,
        c: created.c,
        f: created.f,
    };
}

export async function deleteCustomFoodServer(id: string): Promise<{ deleted: boolean }> {
    const userId = await requireMe();
    const found = await db.nutritionCustomFood.findFirst({
        where: { id, userId },
        select: { id: true },
    });
    if (!found) return { deleted: false };

    await db.nutritionEntry.updateMany({
        where: { userId, customFoodId: id },
        data: { customFoodId: null },
    });
    await db.nutritionCustomFood.delete({ where: { id } });
    return { deleted: true };
}
