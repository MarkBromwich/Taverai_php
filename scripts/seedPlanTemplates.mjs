// scripts/seedPlanTemplates.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Keep this list stable. Use `slug` as your “authoritative ID”
 * so you can rename names later without breaking references.
 *
 * NOTE: We intentionally do NOT include weightwatchers.
 */
const TEMPLATES = [
  { slug: "mediterranean", name: "Mediterranean Diet", category: "COMPOSITION" },
  { slug: "flexitarian", name: "Flexitarian Diet", category: "COMPOSITION" },
  { slug: "dash", name: "DASH Diet", category: "MEDICAL" },
  { slug: "mind", name: "MIND Diet", category: "MEDICAL" },
  { slug: "plant-forward", name: "Plant-Forward / Plant-Based", category: "COMPOSITION" },
  { slug: "pescatarian", name: "Pescatarian", category: "COMPOSITION" },
  { slug: "volumetrics", name: "Volumetrics Diet", category: "BEHAVIOR" },
  { slug: "intermittent-fasting", name: "Intermittent Fasting / Time-Restricted Eating", category: "TIMING" },
  { slug: "low-gi", name: "Low-Glycemic Index (GI) Diet", category: "MEDICAL" },
  { slug: "anti-inflammatory", name: "Anti-inflammatory Diet", category: "MEDICAL" },
  { slug: "high-fiber", name: "High-Fiber (Fibermaxxing)", category: "BEHAVIOR" },
  { slug: "keto", name: "Ketogenic (Keto) / Low-Carb", category: "MACRO" },
  { slug: "paleo", name: "Paleo Diet", category: "COMPOSITION" },
  { slug: "whole30", name: "Whole30", category: "ELIMINATION" },

  // optional adds
  { slug: "vegetarian", name: "Vegetarian", category: "COMPOSITION" },
  { slug: "vegan", name: "Vegan", category: "COMPOSITION" },
  { slug: "high-protein", name: "High-Protein", category: "MACRO" },
  { slug: "gluten-free", name: "Gluten-Free", category: "ELIMINATION" },
  { slug: "low-fodmap", name: "Low-FODMAP", category: "MEDICAL" },
];

async function main() {
  // If WeightWatchers was previously seeded, remove it.
  await prisma.planTemplate.deleteMany({
    where: { slug: "weightwatchers" },
  });

  for (const t of TEMPLATES) {
    await prisma.planTemplate.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        category: t.category,
      },
      create: {
        slug: t.slug,
        name: t.name,
        category: t.category,
      },
    });
  }

  console.log(`Seeded ${TEMPLATES.length} plan templates`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });