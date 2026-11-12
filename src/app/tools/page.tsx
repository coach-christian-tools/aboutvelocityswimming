import type { Metadata } from "next";
import AccountProfile from "@/components/shared/AccountProfile";
import ToolDescriptions from "@/components/shared/ToolDescriptions";

export const metadata: Metadata = {
  title: "Account | Velocity Swimming",
  description: "Manage your Velocity Swimming account and learn what each tool does.",
};

export default function AccountPage() {
  return (
    <main aria-labelledby="account-heading" className="mx-auto w-full max-w-4xl px-5 pt-5 pb-16 sm:px-8 sm:pt-8 lg:px-12 lg:pt-12">
      <h1 id="account-heading" className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
        Account
      </h1>
      <AccountProfile />
      <ToolDescriptions />
    </main>
  );
}
