import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user.user_metadata.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.user_metadata.avatar_url}
                alt="avatar"
                className="h-12 w-12 rounded-full"
              />
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {user.user_metadata.full_name ?? user.email}
              </h1>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            You&apos;re signed in. Start building your app here.
          </p>
        </div>
      </div>
    </main>
  );
}
