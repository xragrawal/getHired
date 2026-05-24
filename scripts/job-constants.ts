import type { JobSearchParams } from "../src/lib/jobs/types";

// ─── Keywords ────────────────────────────────────────────────────────────────

export const KEYWORDS = {
  fullstack: [
    "junior full stack developer",
    "junior fullstack developer",
    "entry level full stack developer",
    "full stack developer fresher",
    "junior web developer",
  ],
};

export const ACTIVE_GROUPS: Array<keyof typeof KEYWORDS> = ["fullstack"];

// ─── Search Passes ────────────────────────────────────────────────────────────

export const PASSES = {
  pune: {
    label: "Pune (on-site / hybrid)",
    baseParams: {
      location: "Pune, Maharashtra, India",
      work_type: "on_site,hybrid",
      experience_level: "entry_level",
      date_posted: "past_24_hours",
      sort_by: "date",
      max_pages: 10,
    } satisfies Omit<JobSearchParams, "keywords">,
  },

  remote: {
    label: "India (remote)",
    baseParams: {
      location: "India",
      work_type: "remote",
      experience_level: "entry_level",
      date_posted: "past_24_hours",
      sort_by: "date",
      max_pages: 10,
    } satisfies Omit<JobSearchParams, "keywords">,
  },
} as const;

// ─── Post-fetch Filters ───────────────────────────────────────────────────────

export const REMOTE_LOCATION_ALLOWLIST = /india|pune|mumbai|bangalore|bengaluru|hyderabad|chennai|delhi|noida|gurugram|gurgaon/i;

// ─── Output ───────────────────────────────────────────────────────────────────

export const OUTPUT_DIR = "scripts/output";
export const OUTPUT_PREFIX = "junior-fullstack-jobs";
