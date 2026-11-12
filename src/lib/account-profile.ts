import { browserClient } from "./supabase/client";
import type { Database } from "./supabase/database.types";
import { withUpdateHold } from "./update-safety";

export type AccountProfile = Pick<
  Database["public"]["Tables"]["account_profiles"]["Row"],
  "user_id" | "username" | "avatar_path"
>;
const profileColumns = "user_id, username, avatar_path";
export const avatarBucket = "account-avatars";
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateAvatar(file: Pick<File, "type" | "size">) {
  if (!Object.hasOwn(imageExtensions, file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (!file.size) {
    throw new Error("This image is empty. Please choose another.");
  }
}

export async function loadAccountProfile(
  userId: string,
): Promise<AccountProfile> {
  const client = browserClient();
  const { data, error } = await client
    .from("account_profiles")
    .select(profileColumns)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // Recover a missing row in an already-open session. Ignore conflicts so a
  // concurrent sign-in or tab cannot overwrite a profile that was just saved.
  const { error: createError } = await client
    .from("account_profiles")
    .upsert(
      { user_id: userId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (createError) throw createError;
  const { data: created, error: readError } = await client
    .from("account_profiles")
    .select(profileColumns)
    .eq("user_id", userId)
    .single();
  if (readError) throw readError;
  return created;
}

export async function loadAccountAvatar(path: string) {
  const { data, error } = await browserClient()
    .storage.from(avatarBucket)
    .download(path);
  if (error) throw error;
  return data;
}

export async function saveAccountProfile(
  previous: AccountProfile,
  draftUsername: string,
  photo: File | null | undefined,
): Promise<AccountProfile> {
  const username = draftUsername.trim();
  if (username && !/^[A-Za-z0-9_.]{3,30}$/.test(username)) {
    throw new Error(
      "Use 3–30 letters, numbers, underscores, or periods for your username.",
    );
  }
  if (photo) validateAvatar(photo);

  return withUpdateHold(async () => {
    const client = browserClient();
    const storage = client.storage.from(avatarBucket);
    let uploadedPath: string | null = null;
    let avatarPath = photo === null ? null : previous.avatar_path;
    if (photo) {
      uploadedPath = `${previous.user_id}/${crypto.randomUUID()}.${imageExtensions[photo.type]}`;
      const { error } = await storage.upload(uploadedPath, photo, {
        contentType: photo.type,
      });
      if (error) throw error;
      avatarPath = uploadedPath;
    }

    let saved: AccountProfile;
    try {
      const { data, error } = await client
        .from("account_profiles")
        .upsert({
          user_id: previous.user_id,
          username,
          avatar_path: avatarPath,
        })
        .select(profileColumns)
        .single();
      if (error) throw error;
      saved = data;
    } catch (error) {
      if (uploadedPath) await storage.remove([uploadedPath]).catch(() => {});
      throw error;
    }

    // A cleanup failure must not report a successful profile save as failed.
    if (previous.avatar_path && previous.avatar_path !== avatarPath) {
      await storage.remove([previous.avatar_path]).catch(() => {});
    }
    return saved;
  });
}
