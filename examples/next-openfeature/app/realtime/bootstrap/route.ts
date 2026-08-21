import { NextResponse } from "next/server";
import { getServerBootstrapConfig } from "../../../lib/server-config";

type AuthSession = {
  accessToken: string;
};

type SnapshotResponse = {
  flags?: Record<string, unknown>;
  descriptions?: Record<string, string>;
  revision?: number;
  accountId?: string;
  appId?: string;
};

async function authenticate(cfg: ReturnType<typeof getServerBootstrapConfig>): Promise<AuthSession> {
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

  return { accessToken: String(authBody.accessToken) };
}

async function fetchSnapshot(cfg: ReturnType<typeof getServerBootstrapConfig>, accessToken: string): Promise<SnapshotResponse> {
  const snapshotRes = await fetch(`${cfg.featureFlagsApiUrl}/flags`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const snapshotBody = await snapshotRes.json().catch(() => null);
  if (!snapshotRes.ok) {
    throw new Error(snapshotBody?.message || snapshotBody?.error || `Flags request failed (${snapshotRes.status})`);
  }

  return snapshotBody || {};
}

export async function GET() {
  try {
    const cfg = getServerBootstrapConfig();
    const { accessToken } = await authenticate(cfg);
    const snapshot = await fetchSnapshot(cfg, accessToken);

    const accountId = String(snapshot.accountId || "").trim();
    const appId = String(snapshot.appId || "").trim();

    return NextResponse.json({
      token: accessToken,
      flags: snapshot.flags && typeof snapshot.flags === "object" ? snapshot.flags : {},
      descriptions: snapshot.descriptions && typeof snapshot.descriptions === "object" ? snapshot.descriptions : {},
      revision: Number(snapshot.revision) || 0,
      accountId,
      appId,
      channel: accountId && appId ? `flags:acc:${accountId}:app:${appId}` : "",
      centrifugoUrl: cfg.centrifugoBaseUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: String(error?.message || "Failed to create realtime bootstrap session"),
      },
      { status: 500 },
    );
  }
}
