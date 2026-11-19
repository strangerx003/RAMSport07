"use client";

import AppShell from "@/components/layout/AppShell";
import FileManager from "@/components/files/FileManager";

export default function Dashboard() {
  return <AppShell title="Files" hideHeader><FileManager/></AppShell>;
}
