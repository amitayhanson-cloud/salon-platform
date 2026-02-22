/**
 * Password policy and strength helpers.
 * Firebase minimum is 6 chars; we recommend >= 10.
 * Requires at least 3 of 4: lowercase, uppercase, number, symbol.
 */

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export const MIN_LENGTH_RECOMMENDED = 10;
export const MIN_LENGTH_FIREBASE = 6;

export interface PolicyResult {
  valid: boolean;
  meetsLength: boolean;
  meetsLengthRecommended: boolean;
  categoryCount: number;
  meetsCategoryRule: boolean;
  suggestions: string[];
}

export interface StrengthResult {
  level: StrengthLevel;
  label: string;
  score: number; // 0-4
  suggestions: string[];
}

function countCategories(password: string): number {
  let count = 0;
  if (/[a-z]/.test(password)) count++;
  if (/[A-Z]/.test(password)) count++;
  if (/\d/.test(password)) count++;
  if (/[^a-zA-Z0-9]/.test(password)) count++;
  return count;
}

export function validatePasswordPolicy(password: string): PolicyResult {
  const len = password.length;
  const meetsLength = len >= MIN_LENGTH_FIREBASE;
  const meetsLengthRecommended = len >= MIN_LENGTH_RECOMMENDED;
  const categoryCount = countCategories(password);
  const meetsCategoryRule = categoryCount >= 3;

  const suggestions: string[] = [];
  if (!meetsLength) {
    suggestions.push(`סיסמה חייבת לכלול לפחות ${MIN_LENGTH_FIREBASE} תווים`);
  } else if (!meetsLengthRecommended) {
    suggestions.push(`מומלץ להשתמש ב־${MIN_LENGTH_RECOMMENDED} תווים ומעלה`);
  }
  if (categoryCount < 3) {
    suggestions.push("הוסף לפחות 3 מהסוגים: אותיות קטנות, אותיות גדולות, מספרים, סימנים מיוחדים");
  }

  const valid = meetsLength && meetsCategoryRule;

  return {
    valid,
    meetsLength,
    meetsLengthRecommended,
    categoryCount,
    meetsCategoryRule,
    suggestions,
  };
}

export function getPasswordStrength(password: string): StrengthResult {
  if (!password) {
    return {
      level: "weak",
      label: "חלש",
      score: 0,
      suggestions: ["הקל סיסמה לבחינת חוזק"],
    };
  }

  const policy = validatePasswordPolicy(password);
  let score = 0;

  if (policy.meetsLength) score++;
  if (policy.meetsLengthRecommended) score++;
  if (policy.meetsCategoryRule) score++;
  if (password.length >= 14 && policy.categoryCount >= 4) score++;

  let level: StrengthLevel = "weak";
  let label = "חלש";
  let suggestions: string[] = [];

  if (score <= 1) {
    level = "weak";
    label = "חלש";
    suggestions = policy.suggestions.length ? policy.suggestions : ["הוסף מילים או תווים נוספים"];
  } else if (score === 2) {
    level = "fair";
    label = "בינוני";
    suggestions = policy.meetsLengthRecommended
      ? ["הוסף מספרים או סימנים מיוחדים"]
      : [`מומלץ לפחות ${MIN_LENGTH_RECOMMENDED} תווים`, "שלב מספרים וסימנים"];
  } else if (score === 3) {
    level = "good";
    label = "טוב";
    suggestions = password.length < 14 ? ["הוספת תווים תחזק את הסיסמה"] : [];
  } else {
    level = "strong";
    label = "חזק";
    suggestions = [];
  }

  return { level, label, score, suggestions };
}
