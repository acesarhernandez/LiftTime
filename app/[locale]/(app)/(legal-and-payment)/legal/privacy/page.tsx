import { Typography } from "@/components/ui/typography";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PrivacyPolicyPage({ params }: PageProps) {
  const { locale } = await params;
  const title = locale === "fr" ? "Politique de Confidentialité" : "Privacy Policy";
  const subtitle =
    locale === "fr" ? "Cette section est temporairement masquée et sera mise à jour prochainement." : "This section is temporarily hidden and will be updated soon.";

  return (
    <div className="bg-muted/50 py-12">
      <div className="container mx-auto max-w-4xl px-4">
        <header className="mb-10 text-center">
          <Typography className="mb-2 text-3xl md:text-4xl" variant="h1">
            {title}
          </Typography>
          <p className="text-muted-foreground text-base md:text-lg">{subtitle}</p>
        </header>
      </div>
    </div>
  );
}
