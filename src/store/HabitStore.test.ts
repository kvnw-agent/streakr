import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { HabitStore } from "./HabitStore.js";

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), "habitstore-test-"));
  filePath = join(tmpDir, "habits.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("HabitStore.load()", () => {
  it("initialises with empty map when file does not exist", async () => {
    const store = await HabitStore.create(filePath);
    expect(await store.getAllHabits()).toEqual([]);
  });

  it("loads habits from an existing valid JSON file", async () => {
    const data = {
      habits: [
        { id: "abc", name: "Run", frequency: "daily", completions: ["2024-01-01"], createdAt: "2024-01-01T00:00:00Z" },
      ],
    };
    await fs.writeFile(filePath, JSON.stringify(data), "utf-8");

    const store = await HabitStore.create(filePath);
    const all = await store.getAllHabits();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Run");
  });

  it("throws on corrupt JSON", async () => {
    await fs.writeFile(filePath, "not-json", "utf-8");
    expect(HabitStore.create(filePath)).rejects.toThrow("Corrupt data file");
  });

  it("throws when habits is not an array", async () => {
    await fs.writeFile(filePath, JSON.stringify({ habits: "bad" }), "utf-8");
    expect(HabitStore.create(filePath)).rejects.toThrow("Corrupt data file");
  });
});

describe("HabitStore.addHabit()", () => {
  it("adds a habit and assigns an id", async () => {
    const store = await HabitStore.create(filePath);
    const habit = await store.addHabit({ name: "Meditate", frequency: "daily" });

    expect(habit.id).toBeDefined();
    expect(habit.name).toBe("Meditate");
    expect(habit.completions).toEqual([]);
    expect(habit.createdAt).toBeDefined();
  });

  it("persists the habit to disk", async () => {
    const store = await HabitStore.create(filePath);
    await store.addHabit({ name: "Read", frequency: "daily" });

    const store2 = await HabitStore.create(filePath);
    const all = await store2.getAllHabits();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Read");
  });
});

describe("HabitStore.getHabit()", () => {
  it("returns the habit by id", async () => {
    const store = await HabitStore.create(filePath);
    const added = await store.addHabit({ name: "Walk", frequency: "daily" });
    const found = await store.getHabit(added.id);
    expect(found?.name).toBe("Walk");
  });

  it("returns undefined for unknown id", async () => {
    const store = await HabitStore.create(filePath);
    expect(await store.getHabit("does-not-exist")).toBeUndefined();
  });
});

describe("HabitStore.updateHabit()", () => {
  it("updates specified fields", async () => {
    const store = await HabitStore.create(filePath);
    const habit = await store.addHabit({ name: "Swim", frequency: "daily" });
    const updated = await store.updateHabit(habit.id, { name: "Swim laps", frequency: "weekly" });

    expect(updated.name).toBe("Swim laps");
    expect(updated.frequency).toBe("weekly");
    expect(updated.id).toBe(habit.id);
  });

  it("throws for unknown id", async () => {
    const store = await HabitStore.create(filePath);
    expect(store.updateHabit("no-such-id", { name: "x" })).rejects.toThrow("Habit not found");
  });
});

describe("HabitStore.deleteHabit()", () => {
  it("deletes an existing habit and returns true", async () => {
    const store = await HabitStore.create(filePath);
    const habit = await store.addHabit({ name: "Yoga", frequency: "daily" });
    const result = await store.deleteHabit(habit.id);

    expect(result).toBe(true);
    expect(await store.getHabit(habit.id)).toBeUndefined();
  });

  it("returns false when habit does not exist", async () => {
    const store = await HabitStore.create(filePath);
    expect(await store.deleteHabit("ghost")).toBe(false);
  });
});

describe("HabitStore.logCompletion()", () => {
  it("adds a date to completions", async () => {
    const store = await HabitStore.create(filePath);
    const habit = await store.addHabit({ name: "Journal", frequency: "daily" });
    await store.logCompletion(habit.id, "2024-03-15");

    const updated = await store.getHabit(habit.id);
    expect(updated?.completions).toContain("2024-03-15");
  });

  it("does not duplicate a date already present", async () => {
    const store = await HabitStore.create(filePath);
    const habit = await store.addHabit({ name: "Journal", frequency: "daily" });
    await store.logCompletion(habit.id, "2024-03-15");
    await store.logCompletion(habit.id, "2024-03-15");

    const updated = await store.getHabit(habit.id);
    expect(updated?.completions.filter((d) => d === "2024-03-15")).toHaveLength(1);
  });

  it("throws for unknown habit id", async () => {
    const store = await HabitStore.create(filePath);
    expect(store.logCompletion("unknown", "2024-03-15")).rejects.toThrow("Habit not found");
  });
});

describe("Atomic save", () => {
  it("round-trips data correctly", async () => {
    const store = await HabitStore.create(filePath);
    await store.addHabit({ name: "Stretch", frequency: "daily" });
    await store.addHabit({ name: "Code", frequency: "daily" });

    const store2 = await HabitStore.create(filePath);
    expect(await store2.getAllHabits()).toHaveLength(2);
  });

  it("leaves no tmp file after save", async () => {
    const store = await HabitStore.create(filePath);
    await store.addHabit({ name: "Tmp test", frequency: "daily" });

    const files = await fs.readdir(tmpDir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });
});
