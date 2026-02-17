export interface Habit {
  id: string;
  name: string;
  description?: string;
  frequency: "daily" | "weekly" | "custom";
  completions: string[]; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
}

export interface HabitsData {
  habits: Habit[];
}
