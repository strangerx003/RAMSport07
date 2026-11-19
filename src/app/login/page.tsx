import type { Metadata } from "next";
import LoginScreen from "@/components/auth/LoginScreen";

export const metadata: Metadata = {
  title: "Sign in ? RAMSport",
  description: "Sign in to your RAMSport engineering workspace.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
