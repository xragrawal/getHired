import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/jobs");

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-gray-900">getHired</span>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <h1 className="text-5xl font-bold text-gray-900 leading-tight max-w-2xl">
          Find jobs that actually match you
        </h1>
        <p className="mt-5 text-lg text-gray-500 max-w-xl">
          getHired fetches fresh LinkedIn listings daily, parses every JD with AI,
          and ranks them by how well they match your profile — so you spend time
          applying, not searching.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="bg-gray-900 text-white text-sm font-medium px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors"
          >
            Get started — it&apos;s free
          </Link>
        </div>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-3 text-sm text-gray-500">
          {[
            "Daily LinkedIn scrape",
            "AI-parsed job descriptions",
            "Vector similarity matching",
            "Multiple personas",
            "Easy Apply filter",
          ].map((f) => (
            <span
              key={f}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
