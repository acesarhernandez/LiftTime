import { Typography } from "@/components/ui/typography";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  const title = locale === "fr" ? "À propos" : "About";
  const subtitle = locale === "fr" ? "Cette page sera bientôt personnalisée." : "This page will be customized soon.";

  return (
    <div className="bg-muted/50 py-12 min-h-screen">
      <div className="container mx-auto max-w-3xl px-4">
        <header className="text-center">
          <Typography className="mb-3 text-3xl md:text-4xl" variant="h1">
            {title}
          </Typography>
          <p className="text-muted-foreground">{subtitle}</p>
        </header>
      </div>
    </div>
  );
}
