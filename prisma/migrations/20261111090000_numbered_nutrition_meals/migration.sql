ALTER TABLE "NutritionEntry"
ALTER COLUMN "meal" TYPE TEXT
USING CASE "meal"::text
  WHEN 'breakfast' THEN 'meal_1'
  WHEN 'lunch' THEN 'meal_2'
  WHEN 'dinner' THEN 'meal_3'
  WHEN 'snack' THEN 'meal_4'
  ELSE "meal"::text
END;

ALTER TABLE "NutritionEntry"
ALTER COLUMN "meal" SET DEFAULT 'meal_1';

CREATE TABLE "NutritionDaySettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "mealCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NutritionDaySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NutritionDaySettings_userId_date_key"
ON "NutritionDaySettings"("userId", "date");

CREATE INDEX "NutritionDaySettings_userId_date_idx"
ON "NutritionDaySettings"("userId", "date");

ALTER TABLE "NutritionDaySettings"
ADD CONSTRAINT "NutritionDaySettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TYPE IF EXISTS "MealType";
