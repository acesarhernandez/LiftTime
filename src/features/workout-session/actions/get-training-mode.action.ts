"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";
import { auth } from "@/features/auth/lib/better-auth";

const getTrainingModeSchema = z.object({});

export const getTrainingModeAction = actionClient.schema(getTrainingModeSchema).action(async () => {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user?.id) {
    return { serverError: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      trainingMode: true
    }
  });

  return {
    trainingMode: user?.trainingMode ?? "BEGINNER"
  };
});
