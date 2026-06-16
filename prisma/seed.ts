import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { DEFAULT_CATEGORIES } from "../src/lib/categories";

// Mirror lib/prisma.ts so `prisma db seed` targets the same database the app
// uses — TURSO_DATABASE_URL when present (production/Turso), else DATABASE_URL.
const adapter = new PrismaLibSQL({
  url:
    process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Categories
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, color: c.color, sortOrder: i },
      create: { slug: c.slug, name: c.name, color: c.color, sortOrder: i },
    });
  }

  // Settings singleton
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", currencyCode: "CAD", currencySymbol: "C$" },
  });

  // Budget/projection plan singleton (buckets/allocations fill in as used).
  await prisma.budgetPlan.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories and settings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
