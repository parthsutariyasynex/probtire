import type { Metadata } from "next";
import { getStaticMetadata } from "@/src/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return getStaticMetadata("my-orders");
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
