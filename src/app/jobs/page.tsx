"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Persona {
  id: string;
  name: string;
  is_default: boolean;
  desired_role: string;
  seniority: string;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  work_arrangement: string;
  employment_type: string;
  seniority_level: string | null;
  skills_required: string[];
  tech_stack: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  easy_apply: boolean;
  url: string;
  posted_date: string;
  applicant_count: string;
  similarity: number;
}

function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    currency === "INR" ? `₹${(n / 100000).toFixed(1)}L` : `${n.toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return null;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "bg-green-100 text-green-800" :
    pct >= 50 ? "bg-yellow-100 text-yellow-800" :
    "bg-gray-100 text-gray-600";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {pct}% match
    </span>
  );
}

function JobCard({ job }: { job: Job }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  const chips = [...(job.skills_required ?? []), ...(job.tech_stack ?? [])]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

  return (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{job.title}</p>
          <p className="text-sm text-gray-600 mt-0.5">{job.company}</p>
        </div>
        <ScoreBadge score={job.similarity} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
        {job.location && <span>{job.location}</span>}
        {job.work_arrangement && <span>· {job.work_arrangement}</span>}
        {job.seniority_level && <span>· {job.seniority_level}</span>}
        {salary && <span>· {salary}</span>}
        {job.easy_apply && (
          <span className="text-blue-600 font-medium">· Easy Apply</span>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((skill) => (
            <span
              key={skill}
              className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-md"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        {job.applicant_count || job.posted_date}
      </p>
    </a>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [feedPersonaName, setFeedPersonaName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then(({ personas }: { personas: Persona[] }) => {
        if (!personas?.length) {
          router.replace("/onboarding");
          return;
        }
        setPersonas(personas);
        const def = personas.find((p) => p.is_default);
        if (def) setActivePersonaId(def.id);
      });
  }, [router]);

  const loadFeed = useCallback(async (personaId: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/jobs/feed?persona=${personaId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load jobs.");
    } else {
      setJobs(data.jobs ?? []);
      setFeedPersonaName(data.persona?.name ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activePersonaId) loadFeed(activePersonaId);
  }, [activePersonaId, loadFeed]);

  async function setDefault(personaId: string) {
    await fetch(`/api/personas/${personaId}/default`, { method: "PATCH" });
    setPersonas((prev) =>
      prev.map((p) => ({ ...p, is_default: p.id === personaId }))
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-gray-900">getHired</h1>

          {/* Persona switcher */}
          {personas.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {personas.map((p) => (
                <div key={p.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActivePersonaId(p.id)}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      activePersonaId === p.id
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                    }`}
                  >
                    {p.name}
                    {p.is_default && (
                      <span className="ml-1.5 text-xs opacity-60">default</span>
                    )}
                  </button>
                  <a
                    href={`/personas/${p.id}/edit`}
                    className="text-xs text-gray-400 hover:text-gray-700 px-1"
                    title="Edit persona"
                  >
                    ✎
                  </a>
                </div>
              ))}
              <a
                href="/onboarding"
                className="text-sm px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 transition-colors"
              >
                + Add persona
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {feedPersonaName && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Jobs for <span className="text-gray-600">{feedPersonaName}</span>
              </h2>
              {!loading && (
                <p className="text-sm text-gray-500 mt-0.5">{jobs.length} matches ranked by relevance</p>
              )}
            </div>
            {activePersonaId && !personas.find((p) => p.id === activePersonaId)?.is_default && (
              <button
                onClick={() => setDefault(activePersonaId)}
                className="text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                Set as default
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-20">
            <p className="text-gray-500">{error}</p>
            {error.includes("onboarding") && (
              <a
                href="/onboarding"
                className="mt-4 inline-block bg-gray-900 text-white text-sm px-4 py-2 rounded-lg"
              >
                Set up profile
              </a>
            )}
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500">No jobs found yet. Run the pipeline to fetch today's listings.</p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="grid gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
