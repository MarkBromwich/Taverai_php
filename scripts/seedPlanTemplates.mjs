// scripts/seedPlanTemplates.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Keep this list stable. Use `slug` as your “authoritative ID”
 * so you can rename labels later without breaking references.
 */
const TEMPLATES = [
  // your list
  { slug: "mediterranean", label: "Mediterranean Diet", category: "balanced" },
  { slug: "flexitarian", label: "Flexitarian Diet", category: "balanced" },
  { slug: "dash", label: "DASH Diet", category: "heart" },
  { slug: "mind", label: "MIND Diet", category: "brain" },
  { slug: "plant-forward", label: "Plant-Forward / Plant-Based", category: "plant" },
  { slug: "pescatarian", label: "Pescatarian", category: "plant" },
  { slug: "volumetrics", label: "Volumetrics Diet", category: "weight" },
  { slug: "intermittent-fasting", label: "Intermittent Fasting / Time-Restricted Eating", category: "timing" },
  { slug: "low-gi", label: "Low-Glycemic Index (GI) Diet", category: "blood-sugar" },
  { slug: "anti-inflammatory", label: "Anti-inflammatory Diet", category: "recovery" },
  { slug: "high-fiber", label: "High-Fiber (Fibermaxxing)", category: "gut" },
  { slug: "keto", label: "Ketogenic (Keto) / Low-Carb", category: "low-carb" },
  { slug: "paleo", label: "Paleo Diet", category: "whole-foods" },
  { slug: "weightwatchers", label: "WeightWatchers (WW)", category: "weight" },
  { slug: "whole30", label: "Whole30", category: "reset" },

  // a few common ones people expect (optional adds)
  { slug: "vegetarian", label: "Vegetarian", category: "plant" },
  { slug: "vegan", label: "Vegan", category: "plant" },
  { slug: "high-protein", label: "High-Protein", category: "performance" },
  { slug: "gluten-free", label: "Gluten-Free", category: "restriction" },
  { slug: "low-fodmap", label: "Low-FODMAP", category: "gut" },
];

async function main() {
  // IMPORTANT: this assumes you created a model like PlanTemplate with a unique `slug`.
  // If your table/model name is different, tell me what you named it and I’ll adjust.

  for (const t of TEMPLATES) {
    await prisma.planTemplate.upsert({
      where: { slug: t.slug },
      update: { label: t.label, category: t.category },
      create: {
        slug: t.slug,
        label: t.label,
        category: t.category,
        // optional future-ready fields if you added them:
        // config: {},
        // isActive: true,
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