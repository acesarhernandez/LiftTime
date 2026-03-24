import React from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getServerUrl } from "@/shared/lib/server-url";
import { paths } from "@/shared/constants/paths";
import { SiteConfig } from "@/shared/config/site-config";
import { WorkoutStepper } from "@/features/workout-builder";
import { auth } from "@/features/auth/lib/better-auth";

import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const isEnglish = locale === "en";
  const title = isEnglish ? "Build Your Perfect Workout" : "Créez Votre Entraînement Parfait";
  const description = isEnglish
    ? "Create free workout routines with our comprehensive exercise database. Track your progress and achieve your fitness goals. 🏋️"
    : "Créez des routines d'entraînement gratuites avec notre base de données d'exercices complète. Suivez vos progrès et atteignez vos objectifs fitness. 🏋️";

  return {
    title,
    description,
    keywords: isEnglish
      ? ["workout builder", "exercise planner", "fitness routine", "personalized training", "muscle targeting", "free workout"]
      : [
          "créateur d'entraînement",
          "planificateur d'exercices",
          "routine fitness",
          "entraînement personnalisé",
          "ciblage musculaire",
          "entraînement gratuit",
        ],
    openGraph: {
      title: `${title} | ${SiteConfig.title}`,
      description,
      images: [
        {
          url: `${getServerUrl()}/images/default-og-image_${locale}.jpg`,
          width: SiteConfig.seo.ogImage.width,
          height: SiteConfig.seo.ogImage.height,
          alt: title,
        },
      ],
    },
    twitter: {
      title: `${title} | ${SiteConfig.title}`,
      description,
      images: [`${getServerUrl()}/images/default-og-image_${locale}.jpg`],
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });

  // Auth-first experience: guests are redirected to a dedicated sign-in page.
  if (!session?.user) {
    const redirectTarget = `/${locale}`;
    redirect(`/${locale}/${paths.signIn}?redirect=${encodeURIComponent(redirectTarget)}`);
  }

  return (
    <div className="bg-background text-foreground relative flex flex-col h-full">
      <WorkoutStepper />
    </div>
  );
}
