export const GROUP_STAGE_ROUND_LABEL = "Group Stage";

export const MATCH_ROUND_OPTIONS = [
  GROUP_STAGE_ROUND_LABEL,
  "Upper Bracket Round 1",
  "Lower Bracket Round 1",
  "Upper Bracket Round 2",
  "Lower Bracket Round 2",
  "Upper Bracket Finals",
  "Lower Bracket Finals",
  "Grand Finals",
] as const;

export type MatchRoundLabel = (typeof MATCH_ROUND_OPTIONS)[number];

export type PlayoffBracketSlot =
  | "upperRoundOne"
  | "upperFinal"
  | "lowerRoundOne"
  | "lowerFinal"
  | "grandFinal";

const PLAYOFF_BRACKET_SLOT_BY_LABEL: Record<string, PlayoffBracketSlot> = {
  "upper bracket round 1": "upperRoundOne",
  "lower bracket round 1": "lowerRoundOne",
  "upper bracket round 2": "upperFinal",
  "upper bracket finals": "upperFinal",
  "upper bracket final": "upperFinal",
  "lower bracket round 2": "lowerFinal",
  "lower bracket finals": "lowerFinal",
  "lower bracket final": "lowerFinal",
  "grand finals": "grandFinal",
  "grand final": "grandFinal",
};

function normalizeRoundLabel(roundLabel: string) {
  return roundLabel.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getPlayoffBracketSlot(
  roundLabel: string
): PlayoffBracketSlot | null {
  return PLAYOFF_BRACKET_SLOT_BY_LABEL[normalizeRoundLabel(roundLabel)] ?? null;
}

export function isPlayoffRoundLabel(roundLabel: string) {
  return getPlayoffBracketSlot(roundLabel) !== null;
}
