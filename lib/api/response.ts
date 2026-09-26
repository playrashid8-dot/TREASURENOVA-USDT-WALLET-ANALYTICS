import { NextResponse } from "next/server";
import {
  getClientIp,
  rateLimit,
  rateLimitHeaders,
  type RateLimitResult,
} from "@/lib/utils/rate-limit";

export function jsonOk<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: message, ...extra },
    { status },
  );
}

export function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): { ok: true; result: RateLimitResult } | { ok: false; response: NextResponse } {
  const ip = getClientIp(request);
  const result = rateLimit(`${bucket}:${ip}`, limit, windowMs);
  if (!result.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: rateLimitHeaders(result),
        },
      ),
    };
  }
  return { ok: true, result };
}

export function withRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  const headers = rateLimitHeaders(result);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, String(v));
  }
  return response;
}
