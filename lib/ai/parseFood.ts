export type ParsedFood = {
  items: Array<{
    name: string;
    quantity?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    tags?: string[];
  }>;
  estimatedCalories?: number;
  dietTags?: string[];
};

export async function parseFoodText(text: string): Promise<ParsedFood> {
  // ✅ Mock parser for now (replace with real AI later)
  // You can tweak this anytime without touching routes or DB.
  return {
    items: [
      {
        name: "Eggs",
        quantity: "2",
        calories: 140,
        proteinG: 12,
        carbsG: 1,
        fatG: 10,
        tags: ["protein"],
      },
      {
        name: "Toast",
        quantity: "1 slice",
        calories: 90,
        carbsG: 18,
        fatG: 1,
        tags: ["grain"],
      },
    ],
    estimatedCalories: 230,
    dietTags: ["mediterranean"],
  };
}
