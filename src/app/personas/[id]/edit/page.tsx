"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

const SENIORITY_OPTIONS = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"] as const;

interface Persona {
  id: string;
  name: string;
  desired_role: string;
  skills: string[];
  experience_years: number;
  seniority: string;
  preferences: string;
  is_default: boolean;
}

export default function EditPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    desired_role: "",
    skills: "",
    experience_years: 0,
    seniority: "Junior" as typeof SENIORITY_OPTIONS[number],
    preferences: "",
  });

  useEffect(() => {
    setLoading(true);
    fetch("/api/personas")
      .then((r) => r.json())
      .then(({ personas }: { personas: Persona[] }) => {
        const persona = personas?.find((p) => p.id === id);
        if (!persona) { router.replace("/jobs"); return; }
        setForm({
          name: persona.name,
          desired_role: persona.desired_role,
          skills: persona.skills.join(", "),
          experience_years: persona.experience_years,
          seniority: persona.seniority as typeof SENIORITY_OPTIONS[number],
          preferences: persona.preferences,
        });
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (!skills.length) { setError("Add at least one skill."); setSaving(false); return; }

    const res = await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, skills }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong."); setSaving(false); return; }

    router.push("/jobs");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit persona</h1>
            <p className="mt-1 text-sm text-gray-500">Changes will re-embed your profile.</p>
          </div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Persona name</label>
            <input
              type="text" required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desired role</label>
            <input
              type="text" required
              value={form.desired_role}
              onChange={(e) => setForm((f) => ({ ...f, desired_role: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seniority</label>
              <select
                value={form.seniority}
                onChange={(e) => setForm((f) => ({ ...f, seniority: e.target.value as typeof SENIORITY_OPTIONS[number] }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {SENIORITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Years of experience</label>
              <input
                type="number" min={0} max={40}
                value={form.experience_years}
                onChange={(e) => setForm((f) => ({ ...f, experience_years: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text" required
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferences <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.preferences}
              onChange={(e) => setForm((f) => ({ ...f, preferences: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit" disabled={saving}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </main>
  );
}
