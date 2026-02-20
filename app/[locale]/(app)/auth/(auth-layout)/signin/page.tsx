import { PortlandSignature } from "@/shared/ui/portland-signature";
import { CredentialsLoginForm } from "@/features/auth/signin/ui/CredentialsLoginForm";

export default async function AuthSignInPage() {
  return (
    <div className="space-y-6">
      <CredentialsLoginForm />
      <PortlandSignature />
    </div>
  );
}
