import { NextResponse } from "next/server";

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function tooManyRequestsJson(retryAfterMs: number, message = "Too many requests. Try again later.") {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

export function serverError(message: string, err: unknown) {
  console.error(message, err);
  return NextResponse.json({ error: message }, { status: 500 });
}
