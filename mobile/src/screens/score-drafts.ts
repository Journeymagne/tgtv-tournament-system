import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type ScoreDraft = {
  revision: string;
  scores: any;
  mission: any;
  tie: boolean;
  apl: any;
  roll: string;
  updatedAt: number;
};
const memory = new Map<string, ScoreDraft>();
const key = (userId: number, gameId: number) => `kt.score.${userId}.${gameId}`;
const index = (userId: number) => `kt.score.index.${userId}`;
let queue: Promise<unknown> = Promise.resolve();

export async function readScoreDraft(
  userId: number,
  gameId: number,
): Promise<ScoreDraft | null> {
  if (!userId) return null;
  try {
    const raw =
      Platform.OS === "web"
        ? memory.get(key(userId, gameId))
        : await SecureStore.getItemAsync(key(userId, gameId));
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && Date.now() - value.updatedAt < 7 * 86400000 ? value : null;
  } catch {
    return null;
  }
}
export function writeScoreDraft(
  userId: number,
  gameId: number,
  draft: ScoreDraft,
): Promise<void> {
  if (!userId) return Promise.resolve();
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (Platform.OS === "web") {
        memory.set(key(userId, gameId), draft);
        return;
      }
      await SecureStore.setItemAsync(
        key(userId, gameId),
        JSON.stringify(draft),
      );
      const entries: string[] = JSON.parse(
        (await SecureStore.getItemAsync(index(userId))) || "[]",
      );
      if (!entries.includes(key(userId, gameId)))
        await SecureStore.setItemAsync(
          index(userId),
          JSON.stringify([...entries, key(userId, gameId)]),
        );
    });
  return queue as Promise<void>;
}
export async function removeScoreDraft(userId: number, gameId: number) {
  await queue.catch(() => {});
  memory.delete(key(userId, gameId));
  if (Platform.OS !== "web")
    await SecureStore.deleteItemAsync(key(userId, gameId));
}
/** Called only after successful sign-out; drafts are never uploaded automatically. */
export async function clearScoreDrafts(userId: number) {
  await queue.catch(() => {});
  for (const name of memory.keys())
    if (name.startsWith(`kt.score.${userId}.`)) memory.delete(name);
  if (Platform.OS === "web") return;
  const entries: string[] = JSON.parse(
    (await SecureStore.getItemAsync(index(userId))) || "[]",
  );
  for (const name of entries)
    if (name.startsWith(`kt.score.${userId}.`))
      await SecureStore.deleteItemAsync(name);
  await SecureStore.deleteItemAsync(index(userId));
}
