// Shared types for the interactive health-history timeline.

export type DatePrecision = "year" | "month" | "day" | "instant";

export type FuzzyDate = {
  iso: string;
  precision: DatePrecision;
};

export type Lane =
  | "Problems"
  | "Medications"
  | "Procedures"
  | "Labs"
  | "Immunizations"
  | "Visits";

export type Coding = { system?: string; code?: string; display?: string };

export type TimelineEvent = {
  id: string;
  sourceType: string;
  lane: Lane;
  start: FuzzyDate;
  end: FuzzyDate | null;
  label: string;
  code: Coding;
  status: string;
  detail: Record<string, unknown>;
  salience: number;
  refs: string[];
};
