import type { Metadata } from "next";
import LandingPage from "@/components/marketing/LandingPage";

export const metadata: Metadata = {
  title: "RAMSport ? Reliability, availability, maintainability & safety workbench",
  description:
    "Model reliability block diagrams and fault trees, keep one source of component data and export the evidence to PDF, Excel, PowerPoint or Word.",
};

export default function HomePage() {
  return <LandingPage />;
}
