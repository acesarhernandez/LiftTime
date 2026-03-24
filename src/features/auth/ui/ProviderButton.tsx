"use client";

import { useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { useI18n } from "locales/client";
import { cn } from "@/shared/lib/utils";
import { getServerUrl } from "@/shared/lib/server-url";
import { authClient } from "@/features/auth/lib/auth-client";
import { Loader } from "@/components/ui/loader";
import { Button, ButtonProps } from "@/components/ui/button";
import { GoogleSvg } from "@/components/svg/GoogleSvg";

import type { ReactNode } from "react";

const ProviderData: Record<string, { icon: ReactNode; name: string; method: "social" | "oauth2" }> = {
  google: {
    icon: <GoogleSvg size={16} />,
    name: "Google",
    method: "social",
  },
  authentik: {
    icon: <Shield size={16} />,
    name: "Keyholder",
    method: "oauth2",
  },
};

type ProviderId = keyof typeof ProviderData;

type ProviderButtonProps = {
  providerId: ProviderId;
  variant: ButtonProps["variant"];
  action: "signin" | "signup";
  className?: string;
};

export const ProviderButton = (props: ProviderButtonProps) => {
  const t = useI18n();

  const searchParams = useSearchParams();
  const provider = ProviderData[props.providerId];

  const authMutation = useMutation({
    mutationFn: async () => {
      const redirectUrl = searchParams.get("redirect");
      const callbackUrl = searchParams.get("callbackUrl");
      const defaultAction = props.action === "signup" ? "signup" : "signin";
      const defaultCallback = `${getServerUrl()}/?${defaultAction}=true`;

      if (provider.method === "social") {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: redirectUrl || callbackUrl || defaultCallback,
        });
        return;
      }

      await authClient.signIn.oauth2({
        providerId: props.providerId,
        callbackURL: redirectUrl || callbackUrl || defaultCallback,
      });
    },
  });

  const traduction =
    props.action === "signin"
      ? t("commons.signin_with", { provider: provider.name })
      : t("commons.signup_with", { provider: provider.name });
  const resolvedVariant = provider.method === "oauth2" ? "black" : props.variant;
  const providerClassName = cn(
    props.className,
    provider.method === "oauth2" && "dark:bg-black dark:text-white dark:hover:bg-black/90",
  );

  return (
    <Button
      className={providerClassName}
      onClick={() => {
        authMutation.mutate();
      }}
      size="large"
      type="button"
      variant={resolvedVariant}
    >
      {authMutation.isPending ? <Loader size={16} /> : provider.icon}
      <span className="ml-2 text-base">{traduction}</span>
    </Button>
  );
};
