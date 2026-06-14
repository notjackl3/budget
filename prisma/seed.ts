import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
} from "../src/lib/categories";

const prisma = new PrismaClient();

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

  // Payment methods
  for (let i = 0; i < DEFAULT_PAYMENT_METHODS.length; i++) {
    const name = DEFAULT_PAYMENT_METHODS[i];
    await prisma.paymentMethod.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
  }

  // Settings singleton
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", currencyCode: "CAD", currencySymbol: "C$" },
  });

  console.log(
    `Seeded ${DEFAULT_CATEGORIES.length} categories, ${DEFAULT_PAYMENT_METHODS.length} payment methods, and settings.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
