import type { Metadata } from "next";
import { getCmsMetadata } from "@/src/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getCmsMetadata("about-us");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
