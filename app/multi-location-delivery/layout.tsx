import type { Metadata } from "next";
import { getStaticMetadata } from "@/src/lib/metadata";

export const metadata: Metadata = getStaticMetadata("multishipping");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
