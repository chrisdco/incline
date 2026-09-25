import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Incline</h1>
      <p className="mb-6 text-sm text-zinc-500">Sign in with the same account as the mobile app.</p>
      <SignIn routing="hash" />
    </div>
  );
}
