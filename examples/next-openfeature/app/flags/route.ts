import { NextResponse } from "next/server";
import { getServerBootstrapConfig } from "../../lib/server-config";

async function authenticate(cfg: ReturnType<typeof getServerBootstrapConfig>): Promise<string> {
  const authRes = await fetch(cfg.consumerAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
    }),
    cache: "no-store",
  });

  const authBody = await authRes.json().catch(() => null);
  if (!authRes.ok || !authBody?.accessToken) {
    throw new Error(authBody?.message || `Consumer auth failed (${authRes.status})`);
  }

  return String(authBody.accessToken);
}

export async function GET() {
  try {
    const cfg = getServerBootstrapConfig();
    const accessToken = await authenticate(cfg);

    const flagsRes = await fetch(`${cfg.featureFlagsApiUrl}/flags`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const flagsBody = await flagsRes.json().catch(() => null);
    if (!flagsRes.ok) {
      throw new Error(flagsBody?.message || flagsBody?.error || `Flags request failed (${flagsRes.status})`);
    }

    return NextResponse.json(flagsBody || {});
  } catch (error: any) {
    return NextResponse.json(
      {
        error: String(error?.message || "Failed to fetch flags"),
      },
      { status: 500 },
    );
  }
}
