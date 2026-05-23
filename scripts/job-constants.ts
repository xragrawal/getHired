import type { JobSearchParams } from "../src/lib/jobs/types";

// ─── Keywords ────────────────────────────────────────────────────────────────

export const KEYWORDS = {
  engineering: [
    "software engineer",
    "backend engineer",
    "frontend engineer",
    // "full stack engineer",
    // "node.js developer",
    // "react developer",
    // "python developer",
    // "java developer",
    // "golang developer",
    // "devops engineer",
    // "site reliability engineer",
    // "data engineer",
    // "machine learning engineer",
    // "ai engineer",
  ],
  blockchain: [
    "blockchain developer",
    // "web3 developer",
    // "solidity developer",
    // "smart contract developer",
    // "crypto developer",
  ],
  design: [
    "product designer",
    // "ui ux designer",
    // "ux designer",
    // "ui designer",
    // "graphic designer",
    // "motion designer",
  ],
  product: [
    "product manager",
    // "technical product manager",
    // "product analyst",
  ],
  data: [
    "data scientist",
    // "data analyst",
    // "business analyst",
    // "ml engineer",
  ],
};

// Which keyword groups to include in the run (comment out to skip)
export const ACTIVE_GROUPS: Array<keyof typeof KEYWORDS> = [
  "engineering",
  "blockchain",
  "design",
  "product",
  "data",
];

// ─── Search Passes ────────────────────────────────────────────────────────────

export const PASSES = {
  // Pass A: on-site and hybrid roles in Pune
  local: {
    label: "Pune (on-site / hybrid)",
    baseParams: {
      location: "Pune, Maharashtra, India",
      work_type: "on_site,hybrid",
      date_posted: "past_24_hours",
      sort_by: "date",
      max_pages: 10, // max allowed by LinkedIn MCP (10 pages × ~25 jobs = ~250 per keyword)
    } satisfies Omit<JobSearchParams, "keywords">,
  },

  // Pass B: remote roles scoped to India (filters out US/EU-only remotes)
  // remote: {
  //   label: "India (remote)",
  //   baseParams: {
  //     location: "India",
  //     work_type: "remote",
  //     date_posted: "past_24_hours",
  //     sort_by: "date",
  //     max_pages: 10,
  //   } satisfies Omit<JobSearchParams, "keywords">,
  // },
} as const;

// ─── Post-fetch Filters ───────────────────────────────────────────────────────

// Drop remote jobs whose location doesn't match this pattern.
// Catches any stray global listings that slip through LinkedIn's location filter.
export const REMOTE_LOCATION_ALLOWLIST = /india|pune|mumbai|bangalore|bengaluru|hyderabad|chennai|delhi|noida|gurugram|gurgaon/i;

// ─── Output ───────────────────────────────────────────────────────────────────

export const OUTPUT_DIR = "scripts/output";
export const OUTPUT_PREFIX = "pune-jobs";
