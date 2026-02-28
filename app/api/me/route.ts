import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/session";
import { serverError, unauthorizedJson } from "@/lib/api";

async function requireUser(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preferences: true },
  });

  if (!user) return null;

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

function buildUserResponse(user: any, prefs: any) {
  return {
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: fullName(user.firstName, user.lastName),
      avatarUrl: user.avatarUrl,
      paidStatus: user.paidStatus,
      billingUrl: (user as any).billingUrl ?? null,
      dailyCalorieGoal: user.dailyCalorieGoal,
      theme: prefs.theme,
      units: prefs.units,
      healthAppProvider: (prefs as any).healthAppProvider ?? null,
      healthAppConnected: (prefs as any).healthAppConnected ?? false,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return unauthorizedJson();
    return NextResponse.json(buildUserResponse(auth.user, auth.prefs));
  } catch (err) {
    return serverError("Failed to load account", err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return unauthorizedJson();

    const body = await req.json().catch(() => null);
    const goal = body?.dailyCalorieGoal;

    if (goal !== null) {
      if (typeof goal !== "number" || !Number.isFinite(goal) || goal < 0 || goal > 20000) {
        return NextResponse.json(
          { error: "dailyCalorieGoal must be a number between 0 and 20000 (or null)" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { dailyCalorieGoal: goal },
      include: { preferences: true },
    });

    const prefs = updated.preferences ?? (await prisma.userPreferences.create({ data: { userId: updated.id } }));
    return NextResponse.json(buildUserResponse(updated, prefs));
  } catch (err) {
    return serverError("Failed to update calorie goal", err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth) return unauthorizedJson();

    const { user } = auth;
    const body = await req.json().catch(() => ({}));

    const userUpdate: Record<string, unknown> = {};

    if (typeof body.firstName === "string") userUpdate.firstName = body.firstName.trim() || null;
    if (typeof body.lastName === "string") userUpdate.lastName = body.lastName.trim() || null;

    if (typeof body.username === "string") {
      const email = body.username.trim().toLowerCase();
      if (email && !email.includes("@")) {
        return NextResponse.json({ error: "username must be a valid email" }, { status: 400 });
      }
      userUpdate.username = email;
    }

    if (typeof body.avatarUrl === "string") {
      const avatarUrl = body.avatarUrl.trim();
      if (avatarUrl && !avatarUrl.startsWith("/uploads/")) {
        return NextResponse.json({ error: "avatarUrl must reference an uploaded image" }, { status: 400 });
      }
      userUpdate.avatarUrl = avatarUrl || null;
    }

    if (body.dailyCalorieGoal === null) {
      userUpdate.dailyCalorieGoal = null;
    } else if (body.dailyCalorieGoal !== undefined) {
      const goal = Number(body.dailyCalorieGoal);
      if (!Number.isFinite(goal) || goal < 0 || goal > 20000) {
        return NextResponse.json(
          { error: "dailyCalorieGoal must be between 0 and 20000 (or null)" },
          { status: 400 }
        );
      }
      userUpdate.dailyCalorieGoal = Math.round(goal);
    }

    const prefsUpdate: Record<string, unknown> = {};

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

    if (Object.keys(userUpdate).length) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdate,
      });
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...prefsUpdate },
      update: { ...prefsUpdate },
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return NextResponse.json(buildUserResponse(updated, prefs));
  } catch (err: any) {
    const code = String(err?.code ?? "");
    if (code === "P2002") {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    return serverError("Failed to update account", err);
  }
}
