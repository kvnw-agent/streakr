import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { dirname } from "path";
import type { Habit, HabitsData } from "./types.js";

export class HabitStore {
  private habits: Map<string, Habit> = new Map();
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async create(filePath: string): Promise<HabitStore> {
    const store = new HabitStore(filePath);
    await store.load();
    return store;
  }

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.habits = new Map();
        return;
      }
      throw err;
    }

    let data: HabitsData;
    try {
      data = JSON.parse(raw) as HabitsData;
    } catch {
      throw new Error(`Corrupt data file at ${this.filePath}: invalid JSON`);
    }

    if (!Array.isArray(data.habits)) {
      throw new Error(`Corrupt data file at ${this.filePath}: "habits" must be an array`);
    }

    this.habits = new Map(data.habits.map((h) => [h.id, h]));
  }

  async save(): Promise<void> {
    const data: HabitsData = { habits: Array.from(this.habits.values()) };
    const json = JSON.stringify(data, null, 2);
    const tmp = `${this.filePath}.tmp`;
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(tmp, json, "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  async addHabit(
    attrs: Omit<Habit, "id" | "completions" | "createdAt"> & Partial<Pick<Habit, "id" | "completions" | "createdAt">>
  ): Promise<Habit> {
    const habit: Habit = {
      id: attrs.id ?? randomUUID(),
      name: attrs.name,
      frequency: attrs.frequency,
      completions: attrs.completions ?? [],
      createdAt: attrs.createdAt ?? new Date().toISOString(),
      ...(attrs.description !== undefined ? { description: attrs.description } : {}),
    };
    this.habits.set(habit.id, habit);
    await this.save();
    return habit;
  }

  async getHabit(id: string): Promise<Habit | undefined> {
    return this.habits.get(id);
  }

  async getAllHabits(): Promise<Habit[]> {
    return Array.from(this.habits.values());
  }

  async updateHabit(id: string, patch: Partial<Habit>): Promise<Habit> {
    const existing = this.habits.get(id);
    if (!existing) {
      throw new Error(`Habit not found: ${id}`);
    }
    const updated: Habit = { ...existing, ...patch, id };
    this.habits.set(id, updated);
    await this.save();
    return updated;
  }

  async deleteHabit(id: string): Promise<boolean> {
    if (!this.habits.has(id)) {
      return false;
    }
    this.habits.delete(id);
    await this.save();
    return true;
  }

  async logCompletion(id: string, date: string): Promise<void> {
    const habit = this.habits.get(id);
    if (!habit) {
      throw new Error(`Habit not found: ${id}`);
    }
    if (!habit.completions.includes(date)) {
      habit.completions.push(date);
      await this.save();
    }
  }
}
