import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function UnauthorizedPage() {
  const { t } = useTranslation("common");

  return (
    <main className="grid min-h-screen place-items-center bg-muted/35 px-4 text-center">
      <div className="max-w-md">
        <ShieldAlert className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold">{t("states.unauthorized_title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("states.unauthorized_description")}</p>
        <Button asChild className="mt-6">
          <Link to="/client/dashboard">{t("actions.back_to_dashboard")}</Link>
        </Button>
      </div>
    </main>
  );
}
