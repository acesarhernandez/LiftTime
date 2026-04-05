import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthEnv } from "@/lib/server/auth/env";
import { verifyAppSessionToken } from "@/lib/server/auth/session";
import { SessionOverview } from "@/screens/workout/SessionOverview";

export default async function Page() {
  let env;
  try {
    env = getAuthEnv();
  } catch {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const appSessionToken = cookieStore.get(env.appSessionCookieName)?.value;
  const sessionResult = verifyAppSessionToken(appSessionToken, env.appSessionSecret);
  if (!sessionResult.ok || !sessionResult.payload) {
    redirect("/login");
  }

  return <SessionOverview authenticatedUserId={sessionResult.payload.sub} />;
}
