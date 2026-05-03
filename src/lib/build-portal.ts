import type { PortalType } from "@/types/auth";

export type BuildPortal = "client" | "supplier" | "backoffice";

const portalToPortalType: Record<BuildPortal, PortalType> = {
  client: "client",
  supplier: "supplier",
  backoffice: "admin"
};

export function getBuildPortal(): BuildPortal {
  if (typeof __BUILD_PORTAL__ === "undefined") {
    throw new Error("__BUILD_PORTAL__ was not injected by Vite. Use a per-portal vite config.");
  }
  return __BUILD_PORTAL__;
}

export function getBuildPortalType(): PortalType {
  return portalToPortalType[getBuildPortal()];
}
