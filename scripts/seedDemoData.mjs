import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ✅ Set this to ONE of:
 *  - your user's id (looks like "cmk...")
 *  - your user's email (like "mark@mail.com")
 *  - your user's username (like "mark")
 *
 * Tip: If you're unsure, email is easiest.
 */
const USER_LOOKUP = "mark@mail.com";

/** How many days back to seed */
const DAYS = 30;

/* ---------------- utilities ---------------- */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/* ---------------- meal templates ---------------- */

const MEALS = [
  {
    text: "Greek yogurt with berries and walnuts",
    items: [
      { name: "Greek yogurt", quantity: "1 cup", calories: 170, proteinG: 20, carbsG: 8, fatG: 6, tags: ["protein"] },
      { name: "Berries", quantity: "1/2 cup", calories: 40, carbsG: 10, fatG: 0, tags: ["fruit"] },
      { name: "Walnuts", quantity: "1 oz", calories: 185, fatG: 18, proteinG: 4, carbsG: 4, tags: ["fat"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [350, 450],
  },
  {
    text: "Chicken salad with olive oil and pita",
    items: [
      { name: "Chicken", quantity: "4 oz", calories: 190, proteinG: 35, fatG: 4, tags: ["protein"] },
      { name: "Salad greens", quantity: "2 cups", calories: 30, carbsG: 6, tags: ["vegetables"] },
      { name: "Olive oil", quantity: "1 tbsp", calories: 120, fatG: 14, tags: ["fat"] },
      { name: "Pita", quantity: "1 small", calories: 170, carbsG: 35, tags: ["grain"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [450, 650],
  },
  {
    text: "Salmon, quinoa, and roasted vegetables",
    items: [
      { name: "Salmon", quantity: "5 oz", calories: 300, proteinG: 34, fatG: 18, tags: ["protein"] },
      { name: "Quinoa", quantity: "3/4 cup", calories: 170, carbsG: 30, tags: ["grain"] },
      { name: "Roasted vegetables", quantity: "2 cups", calories: 140, carbsG: 20, tags: ["vegetables"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [600, 800],
  },
  {
    text: "Coffee and a banana",
    items: [
      { name: "Coffee", quantity: "1 cup", calories: 5, tags: ["drink"] },
      { name: "Banana", quantity: "1", calories: 105, carbsG: 27, tags: ["fruit"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [80, 150],
  },
  {
    text: "Pepperoni pizza and soda",
    items: [
      { name: "Pizza", quantity: "3 slices", calories: 900, carbsG: 96, fatG: 42, tags: ["processed"] },
      { name: "Soda", quantity: "16 oz", calories: 200, carbsG: 52, tags: ["processed"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [900, 1200],
  },
  {
    text: "Burger, fries, and milkshake",
    items: [
      { name: "Burger", quantity: "1", calories: 650, fatG: 38, tags: ["processed"] },
      { name: "Fries", quantity: "medium", calories: 380, fatG: 18, tags: ["processed"] },
      { name: "Milkshake", quantity: "small", calories: 520, fatG: 18, tags: ["processed"] },
    ],
    dietTags: ["mediterranean"],
    calRange: [1300, 1700],
  },
];

/* ---------------- behavior shaping ---------------- */

function dayProfile(dayIndex) {
  // last 7 days improve so streak/trend show
  if (dayIndex <= 6) return "good";
  const r = Math.random();
  if (r < 0.55) return "meh";
  if (r < 0.8) return "good";
  return "bad";
}

function mealsForProfile(profile) {
  if (profile === "good") return randInt(3, 4);
  return randInt(2, 3);
}

function pickMeal(profile) {
  if (profile === "bad") return pick([MEALS[4], MEALS[5], MEALS[2]]);
  if (profile === "meh") return pick([MEALS[1], MEALS[2], MEALS[3]]);
  return pick([MEALS[0], MEALS[1], MEALS[2], MEALS[3]]);
}

function makeCreatedAt(dayStart, slot) {
  const hours = [8, 12, 18, 21][slot] ?? randInt(9, 20);
  const minutes = randInt(0, 59);
  const d = new Date(dayStart);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/* ---------------- main ---------------- */

async function findUser(lookup) {
  // 1) id
  let user = await prisma.user.findUnique({ where: { id: lookup } }).catch(() => null);

  // 2) email (if your schema has email)
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: lookup } }).catch(() => null);
  }

  // 3) username
  if (!user) {
    user = await prisma.user.findFirst({ where: { username: lookup } }).catch(() => null);
  }

  return user;
}

async function main() {
  if (!USER_LOOKUP || USER_LOOKUP.includes("PASTE")) {
    console.error("❌ You must set USER_LOOKUP at the top of this file.");
    process.exit(1);
  }

  const user = await findUser(USER_LOOKUP);

  if (!user) {
    console.error("❌ No user found for USER_LOOKUP:", USER_LOOKUP);
    console.error("Tip: try the foodapp_session cookie value (it looks like 'cmk...').");
    process.exit(1);
  }

  console.log(`Seeding demo data for user: ${user.username} (${user.id})`);

  // 🔥 Optional: wipe existing entries for this user so the demo is clean
  // await prisma.entryPlanScore.deleteMany({ where: { entry: { userId: user.id } } });
  // await prisma.foodEntry.deleteMany({ where: { userId: user.id } });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let created = 0;

  for (let i = 0; i < DAYS; i++) {
    const day = new Date(todayStart);
    day.setDate(day.getDate() - i);

    const profile = dayProfile(i);
    const count = mealsForProfile(profile);

    const slots = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, count);

    for (const slot of slots) {
      const meal = pickMeal(profile);
      const createdAt = makeCreatedAt(day, slot);

      const parsed = {
        items: meal.items,
        dietTags: meal.dietTags,
        estimatedCalories: randInt(meal.calRange[0], meal.calRange[1]),
      };

      await prisma.foodEntry.create({
        data: {
          userId: user.id,
          text: meal.text,
          createdAt,
          parsed,
        },
      });

      created++;
    }
  }

  console.log(`✅ Seed complete: ${created} food entries created.`);
  console.log("👉 Next: run `node scripts/backfillScores.mjs` to generate compliance scores.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });