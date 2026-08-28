import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PortalClient } from "@/components/portal/portal-client";
import {
  buildPortalSnapshot,
  findPortalLinkByToken,
  registerPortalView,
  resolvePortalLinkState,
} from "@/lib/portal/data";
import { portalCookieName, verifyPortalSessionJwt } from "@/lib/portal/tokens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal do Cliente | OptSolv Time",
  description: "Acompanhamento de horas e progresso do projeto.",
  robots: { index: false, follow: false },
};

interface PortalPageProps {
  params: Promise<{ token: string }>;
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { token } = await params;

  const link = await findPortalLinkByToken(token);
  const state = resolvePortalLinkState(link);

  if (state !== "ok" || !link) {
    return <PortalClient token={token} initialState={state} snapshot={null} />;
  }

  if (link.passwordHash) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(portalCookieName(link.id));
    const authorized = sessionCookie
      ? await verifyPortalSessionJwt(sessionCookie.value, link.id)
      : false;

    if (!authorized) {
      return (
        <PortalClient
          token={token}
          initialState="password_required"
          snapshot={null}
        />
      );
    }
  }

  const snapshot = await buildPortalSnapshot(link);
  if (!snapshot) {
    return (
      <PortalClient token={token} initialState="not_found" snapshot={null} />
    );
  }

  registerPortalView(link.id);

  return <PortalClient token={token} initialState="ok" snapshot={snapshot} />;
}
