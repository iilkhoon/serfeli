import type { Metadata } from "next";
import { safeReturnPath } from "../../lib/auth/return-path";
import SignInForm from "./sign-in-form";

export const metadata: Metadata = {
  title: "Hesaba daxil ol | Qəpik",
  description: "E-poçtunuza göndərilən kodla Qəpik hesabınıza daxil olun.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Production sign-in. In `npm run dev` the local sign-in plugin answers /giris before this page.
export default async function SignInPage({ searchParams }: Props) {
  const raw = (await searchParams).return_to;
  return (
    <main className="nf" id="main-content">
      <div className="nf-card auth-card">
        <a className="logo" href="/" aria-label="Qəpik ana səhifə">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          qəpik<span className="logo-dot">.</span>
        </a>
        <h1>Hesaba daxil ol</h1>
        <SignInForm returnTo={safeReturnPath(typeof raw === "string" ? raw : null)} />
      </div>
    </main>
  );
}
