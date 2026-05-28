"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const SENIORITY_OPTIONS = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"] as const;

type ParsedResume = {
  desired_role: string;
  skills: string[];
  experience_years: number;
  seniority: typeof SENIORITY_OPTIONS[number];
  preferences: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [resumeParsed, setResumeParsed] = useState(false);

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then(({ personas }) => {
        if (personas?.length) router.replace("/jobs");
        else setChecking(false);
      });
  }, [router]);

  const [form, setForm] = useState({
    name: "",
    desired_role: "",
    skills: "",
    experience_years: 0,
    seniority: "Junior" as typeof SENIORITY_OPTIONS[number],
    preferences: "",
  });

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setError(null);
    setResumeParsed(false);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/resume/parse", { method: "POST", body: fd });
    const data = await res.json();

    setParsing(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to parse resume.");
      return;
    }

    const parsed = data as ParsedResume;
    setForm((f) => ({
      ...f,
      desired_role: parsed.desired_role || f.desired_role,
      skills: parsed.skills?.join(", ") || f.skills,
      experience_years: parsed.experience_years ?? f.experience_years,
      seniority: parsed.seniority || f.seniority,
      preferences: parsed.preferences || f.preferences,
    }));
    setResumeParsed(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const skills = form.skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (skills.length === 0) {
      setError("Add at least one skill.");
      setLoading(false);
      return;
    }

    const personaName = form.name || form.desired_role || "My Profile";

    const res = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, name: personaName, skills }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    router.push("/jobs");
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900">Set up your profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload your resume to auto-fill, or fill in manually below.
        </p>

        {/* Resume upload */}
        <div className="mt-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleResumeUpload}
          />
          <button
            type="button"
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            {parsing ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
                Parsing resume…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload resume (PDF)
              </>
            )}
          </button>

          {resumeParsed && (
            <p className="mt-2 text-xs text-green-600 font-medium">
              Resume parsed — review and edit the fields below.
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          or fill in manually
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Persona name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Persona name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Full Stack Engineer"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Desired role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desired role
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Full Stack Developer"
              value={form.desired_role}
              onChange={(e) => setForm((f) => ({ ...f, desired_role: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Seniority + Experience */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seniority
              </label>
              <select
                value={form.seniority}
                onChange={(e) => setForm((f) => ({ ...f, seniority: e.target.value as typeof SENIORITY_OPTIONS[number] }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {SENIORITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Years of experience
              </label>
              <input
                type="number"
                min={0}
                max={40}
                value={form.experience_years}
                onChange={(e) => setForm((f) => ({ ...f, experience_years: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              required
              placeholder="React, Node.js, TypeScript, PostgreSQL"
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Preferences */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferences <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Remote or Pune, product startups, Series A–C"
              value={form.preferences}
              onChange={(e) => setForm((f) => ({ ...f, preferences: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || parsing}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating persona…" : "Continue to jobs"}
          </button>
        </form>
      </div>
    </main>
  );
}
