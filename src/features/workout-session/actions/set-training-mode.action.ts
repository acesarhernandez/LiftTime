"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";
import { auth } from "@/features/auth/lib/better-auth";

const setTrainingModeSchema = z.object({
  mode: z.enum(["BEGINNER", "ADVANCED"])
});

export const setTrainingModeAction = actionClient.schema(setTrainingModeSchema).action(async ({ parsedInput }) => {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user?.id) {
    return { serverError: "Unauthorized" };
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      trainingMode: parsedInput.mode
    },
    select: {
      trainingMode: true
    }
  });

  return {
    trainingMode: updated.trainingMode
  };
});
