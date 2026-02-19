"use client";

import { useSession } from "@/features/auth/lib/auth-client";

export function useUserSubscription() {
  const { data: session, ...rest } = useSession();
  const isPremium = process.env.NODE_ENV === "development" ? true : session?.user?.isPremium || false;

  return { isPremium, ...rest };
}
