import type { Metadata } from "next";
import { getStaticMetadata } from "@/src/lib/metadata";

export const metadata: Metadata = getStaticMetadata("checkout-success");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
