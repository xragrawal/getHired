export interface LinkedInJob {
  job_id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  easy_apply: boolean;
  promoted: boolean;
  posted_date: string;
  url: string;
  source: "linkedin";
  fetched_at: string;
}

export interface JobDetails {
  job_id: string;
  url: string;
  employment_type: string;       // Full-time | Part-time | Contract | Internship
  work_arrangement: string;      // Remote | On-site | Hybrid
  applicant_count: string;       // "Over 100 applicants", "27 applicants"
  is_accepting: boolean;         // false if "No longer accepting applications"
  jd_raw: string;                // full scraped text
  detail_fetched_at: string;
}

export interface LinkedInJobWithDetails extends LinkedInJob {
  details: JobDetails | null;
  pass_type: "local" | "remote";
}

export interface JobSearchParams {
  keywords: string;
  location?: string;
  max_pages?: number;
  date_posted?: "past_hour" | "past_24_hours" | "past_week" | "past_month";
  job_type?: string;
  experience_level?: string;
  work_type?: string;
  easy_apply?: boolean;
  sort_by?: "date" | "relevance";
}

export interface JobSearchResult {
  jobs: LinkedInJob[];
  total_found: number;
  search_url: string;
}
