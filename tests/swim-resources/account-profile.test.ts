import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(), remove: vi.fn(), single: vi.fn(), upsert: vi.fn(),
  select: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: () => ({ upsert: mocks.upsert, select: mocks.select }),
  }),
}));
vi.mock("@/lib/update-safety", () => ({ withUpdateHold: (fn: () => Promise<unknown>) => fn() }));
import { loadAccountProfile, saveAccountProfile, validateAvatar } from "@/lib/account-profile";

const previous = { user_id: "owner", username: "old.name", bio: "", avatar_path: "owner/old.png" };
const photo = new File(["photo"], "photo.png", { type: "image/png" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { ...previous, username: "new.name" }, error: null });
  mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: mocks.maybeSingle, single: mocks.single }) });
  mocks.maybeSingle.mockResolvedValue({ data: previous, error: null });
});

describe("automatic profile recovery", () => {
  it("loads an existing profile without rewriting it", async () => {
    await expect(loadAccountProfile(previous.user_id)).resolves.toEqual(previous);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("creates a missing profile without overwriting a concurrent saved profile", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(loadAccountProfile(previous.user_id)).resolves.toMatchObject({ username: "new.name" });
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(
      { user_id: previous.user_id }, { onConflict: "user_id", ignoreDuplicates: true },
    );
    expect(mocks.single).toHaveBeenCalledOnce();
  });
  it("does not mistake an unavailable profile table for a missing account", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("Table unavailable") });
    await expect(loadAccountProfile(previous.user_id)).rejects.toThrow("Table unavailable");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("reports profile creation failures instead of returning an unsaved profile", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upsert.mockResolvedValue({ error: new Error("Creation failed") });
    await expect(loadAccountProfile(previous.user_id)).rejects.toThrow("Creation failed");
    expect(mocks.single).not.toHaveBeenCalled();
  });
});

describe("profile save recovery", () => {
  it("accepts large images while rejecting unsupported or empty files", () => {
    expect(() => validateAvatar({ type: "image/svg+xml", size: 30 })).toThrow("JPG, PNG, or WebP");
    expect(() => validateAvatar({ type: "image/png", size: 100 * 1024 * 1024 })).not.toThrow();
    expect(() => validateAvatar({ type: "image/png", size: 0 })).toThrow("empty");
  });
  it("keeps the existing profile and photo when upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: new Error("offline") });
    await expect(saveAccountProfile(previous, { username: "new.name", bio: "" }, photo)).rejects.toThrow("offline");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans up only the new upload when the profile save fails", async () => {
    mocks.single.mockResolvedValue({ error: new Error("save failed") });
    await expect(saveAccountProfile(previous, { username: "new.name", bio: "" }, photo)).rejects.toThrow("save failed");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.remove).not.toHaveBeenCalledWith([previous.avatar_path]);
  });
  it("does not turn a successful save into an error if old photo cleanup fails", async () => {
    mocks.remove.mockRejectedValue(new Error("offline"));
    await expect(saveAccountProfile(previous, { username: "new.name", bio: "" }, photo)).resolves.toMatchObject({ username: "new.name" });
    expect(mocks.remove).toHaveBeenCalledWith([previous.avatar_path]);
  });
  it("preserves an unchanged photo and removes a deleted photo after saving", async () => {
    await saveAccountProfile(previous, { username: "new.name", bio: "" }, undefined);
    expect(mocks.upsert).toHaveBeenLastCalledWith({ ...previous, username: "new.name" });
    expect(mocks.remove).not.toHaveBeenCalled();
    await saveAccountProfile(previous, { username: "", bio: "" }, null);
    expect(mocks.upsert).toHaveBeenLastCalledWith({ ...previous, username: "", avatar_path: null });
    expect(mocks.remove).toHaveBeenCalledWith([previous.avatar_path]);
  });
});
