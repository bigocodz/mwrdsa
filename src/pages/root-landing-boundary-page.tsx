import { Navigate } from "react-router-dom";

export function RootLandingBoundaryPage() {
  return <Navigate to="/client/dashboard" replace />;
}
