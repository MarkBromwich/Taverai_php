import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "foodapp_session";

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

async function requireUser(req: NextRequest) {
  const userId = readCookie(req.headers.get("cookie"), COOKIE_NAME);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preferences: true },
  });

  if (!user) return null;

  // Ensure preferences exists (so UI can always rely on it)
  let prefs = user.preferences;
  if (!prefs) {
    prefs = await prisma.userPreferences.create({
      data: { userId: user.id },
    });
  }

  return { user, prefs };
}

function fullName(firstName?: string | null, lastName?: string | null) {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  const combined = `${f} ${l}`.trim();
  return combined.length ? combined : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, prefs } = auth;

    return NextResponse.json({
      user: {
        id: user.id,

        // username IS the email now (per your plan)
        username: user.username,

        // NEW profile fields (schema: firstName/lastName)
        firstName: user.firstName,
        lastName: user.lastName,

        // convenience for UI display (optional but helpful)
        displayName: fullName(user.firstName, user.lastName),

        avatarUrl: user.avatarUrl,

        // subscription-ish
        paidStatus: user.paidStatus,

        // keep this if it exists in your schema; otherwise remove it
        billingUrl: (user as any).billingUrl ?? null,

        // existing
        dailyCalorieGoal: user.dailyCalorieGoal,

        // preferences
        theme: prefs.theme,
        units: prefs.units,
        healthAppProvider: (prefs as any).healthAppProvider ?? null,
        healthAppConnected: (prefs as any).healthAppConnected ?? false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Me GET crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

/**
 * Keep PUT for dailyCalorieGoal (backwards compatible with your current UI)
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user } = auth;

    const body = await req.json().catch(() => null);
    const goal = body?.dailyCalorieGoal;

    // allow null to clear the goal
    if (goal !== null) {
      if (typeof goal !== "number" || !Number.isFinite(goal) || goal < 0 || goal > 20000) {
        return NextResponse.json(
          { error: "dailyCalorieGoal must be a number between 0 and 20000 (or null)" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { dailyCalorieGoal: goal },
      include: { preferences: true },
    });

    const prefs =
      updated.preferences ??
      (await prisma.userPreferences.create({ data: { userId: updated.id } }));

    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,

        firstName: updated.firstName,
        lastName: updated.lastName,
        displayName: fullName(updated.firstName, updated.lastName),

        avatarUrl: updated.avatarUrl,
        paidStatus: updated.paidStatus,
        billingUrl: (updated as any).billingUrl ?? null,

        dailyCalorieGoal: updated.dailyCalorieGoal,

        theme: prefs.theme,
        units: prefs.units,
        healthAppProvider: (prefs as any).healthAppProvider ?? null,
        healthAppConnected: (prefs as any).healthAppConnected ?? false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Me PUT crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH for updating profile + preferences (for the U page buttons/forms)
 * Send only what you want to update.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user } = auth;
    const body = await req.json().catch(() => ({}));

    // ---- validate & whitelist user fields ----
    const userUpdate: any = {};

    if (typeof body.firstName === "string") userUpdate.firstName = body.firstName.trim() || null;
    if (typeof body.lastName === "string") userUpdate.lastName = body.lastName.trim() || null;

    // Username is email now. Allow updating it if you want.
    // If you DON'T want this editable from client, remove this block.
    if (typeof body.username === "string") {
      const email = body.username.trim().toLowerCase();
      if (email && !email.includes("@")) {
        return NextResponse.json({ error: "username must be a valid email" }, { status: 400 });
      }
      userUpdate.username = email;
    }

    if (typeof body.avatarUrl === "string") userUpdate.avatarUrl = body.avatarUrl.trim() || null;

    // Keep for dev/testing only
    if (typeof body.paidStatus === "string") userUpdate.paidStatus = body.paidStatus.trim() || "Free";
    if (typeof body.billingUrl === "string") userUpdate.billingUrl = body.billingUrl.trim() || null;

    // ---- validate & whitelist preferences fields ----
    const prefsUpdate: any = {};

    if (typeof body.theme === "string") {
      const v = body.theme.trim();
      if (!["dark", "light", "system"].includes(v)) {
        return NextResponse.json({ error: "theme must be dark, light, or system" }, { status: 400 });
      }
      prefsUpdate.theme = v;
    }

    if (typeof body.units === "string") {
      const v = body.units.trim();
      if (!["metric", "imperial"].includes(v)) {
        return NextResponse.json({ error: "units must be metric or imperial" }, { status: 400 });
      }
      prefsUpdate.units = v;
    }

    if (typeof body.healthAppProvider === "string") {
      prefsUpdate.healthAppProvider = body.healthAppProvider.trim() || null;
    }

    if (typeof body.healthAppConnected === "boolean") {
      prefsUpdate.healthAppConnected = body.healthAppConnected;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...userUpdate,
        preferences: {
          upsert: {
            create: { userId: user.id, ...prefsUpdate },
            update: { ...prefsUpdate },
          },
        },
      },
      include: { preferences: true },
    });

    const prefs = updated.preferences!;

    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,

        firstName: updated.firstName,
        lastName: updated.lastName,
        displayName: fullName(updated.firstName, updated.lastName),

        avatarUrl: updated.avatarUrl,
        paidStatus: updated.paidStatus,
        billingUrl: (updated as any).billingUrl ?? null,

        dailyCalorieGoal: updated.dailyCalorieGoal,

        theme: prefs.theme,
        units: prefs.units,
        healthAppProvider: (prefs as any).healthAppProvider ?? null,
        healthAppConnected: (prefs as any).healthAppConnected ?? false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Me PATCH crashed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}