import type { Metadata } from "next";
import { getCmsMetadata } from "@/src/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getCmsMetadata("product-catalogue");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
