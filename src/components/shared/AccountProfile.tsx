"use client";

import Image from "next/image";
import {
  Camera,
  Check,
  LoaderCircle,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useAuth } from "@/features/workshare/contexts/auth";
import { useUpdateBlocker } from "@/hooks/useUpdateBlocker";
import {
  loadAccountAvatar,
  loadAccountProfile,
  saveAccountProfile,
  validateAvatar,
  type AccountProfile as Profile,
} from "@/lib/account-profile";
import { Button } from "./Button";
import { Input } from "./Input";

function ProfilePhoto({
  path,
  file,
  initial,
}: {
  path: string | null;
  file?: File | null;
  initial: string;
}) {
  const [image, setImage] = useState<{
    source: string | File;
    url?: string;
    failed?: boolean;
  }>();
  const source = file === undefined ? path : file;
  useEffect(() => {
    if (!source) return;
    let active = true;
    let url: string | undefined;
    const blob =
      typeof source === "string"
        ? loadAccountAvatar(source)
        : Promise.resolve(source);
    void blob
      .then((data) => {
        if (!active) return;
        url = URL.createObjectURL(data);
        setImage({ source, url });
      })
      .catch(() => {
        if (active) setImage({ source, failed: true });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);
  const current = image?.source === source ? image : undefined;
  return (
    <div className="shrink-0">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/10 text-3xl font-semibold text-accent">
        {current?.url ? (
          <Image
            src={current.url}
            alt="Your profile picture"
            width={96}
            height={96}
            unoptimized
            className="size-full object-cover"
            onError={() => setImage({ source: source!, failed: true })}
          />
        ) : source && !current?.failed ? (
          <LoaderCircle
            className="size-6 animate-spin"
            aria-label="Loading profile picture"
          />
        ) : (
          <span aria-label="Default profile picture">{initial}</span>
        )}
      </div>
      {current?.failed && (
        <p className="mt-2 max-w-28 text-xs text-text-secondary" role="status">
          Photo unavailable. Try reloading.
        </p>
      )}
    </div>
  );
}

function ProfileEditor({
  initial,
  email,
}: {
  initial: Profile;
  email: string | null;
}) {
  const [saved, setSaved] = useState(initial);
  const [username, setUsername] = useState(initial.username);
  // undefined keeps the saved photo; null removes it; File replaces it on save.
  const [photo, setPhoto] = useState<File | null>();
  const [saving, setSaving] = useState(false);
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const photoChanged =
    photo != null || (photo === null && saved.avatar_path !== null);
  const dirty = username !== saved.username || photoChanged;
  useUpdateBlocker(dirty || saving || choosingPhoto);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy.current) return;
    busy.current = true;
    setChoosingPhoto(true);
    setError("");
    setSuccess(false);
    try {
      validateAvatar(file);
      const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error(
          "This image could not be opened. Try another JPG, PNG, or WebP.",
        );
      });
      bitmap.close();
      setPhoto(file);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open this image. Please try another.",
      );
    } finally {
      busy.current = false;
      setChoosingPhoto(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !dirty) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const profile = await saveAccountProfile(saved, username, photo);
      setSaved(profile);
      setUsername(profile.username);
      setPhoto(undefined);
      setSuccess(true);
    } catch {
      setError(
        "We couldn’t save your profile. Your changes are still here—please try again.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function discard() {
    setUsername(saved.username);
    setPhoto(undefined);
    setError("");
    setSuccess(false);
  }

  return (
    <form onSubmit={save} aria-label="Edit your profile">
      <fieldset
        disabled={saving || choosingPhoto}
        className="min-w-0 space-y-6"
      >
        <legend className="sr-only">Profile details</legend>
        <div className="flex flex-wrap items-center gap-5">
          <ProfilePhoto
            path={saved.avatar_path}
            file={photo}
            initial={(username || email || "V").slice(0, 1).toUpperCase()}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => input.current?.click()}
              >
                <Camera className="mr-2 size-4" aria-hidden="true" />
                {choosingPhoto ? "Checking photo…" : "Upload photo"}
              </Button>
              {(photo || (photo === undefined && saved.avatar_path)) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhoto(null);
                    setSuccess(false);
                    setError("");
                  }}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose profile picture"
              className="hidden"
              onChange={choosePhoto}
            />
            <p className="mt-2 text-xs text-text-secondary">
              JPG, PNG, or WebP.
            </p>
          </div>
        </div>
        <div className="max-w-sm">
          <label
            htmlFor="profile-username"
            className="mb-2 block text-sm font-semibold"
          >
            Username
          </label>
          <Input
            id="profile-username"
            autoComplete="nickname"
            value={username}
            maxLength={30}
            minLength={3}
            pattern="[A-Za-z0-9_.]{3,30}"
            placeholder="Choose a username"
            aria-describedby="username-hint"
            onChange={(event) => {
              setUsername(event.target.value);
              setSuccess(false);
            }}
          />
          <p id="username-hint" className="mt-2 text-xs text-text-secondary">
            3–30 letters, numbers, underscores, or periods. Optional.
          </p>
        </div>
        {dirty && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <Button type="submit" disabled={saving || choosingPhoto}>
              {saving && (
                <LoaderCircle
                  className="mr-2 size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={discard}>
              Discard changes
            </Button>
          </div>
        )}
      </fieldset>
      {success && (
        <p
          role="status"
          className="mt-4 flex items-center gap-1.5 text-sm text-accent"
        >
          <Check className="size-4" aria-hidden="true" />
          Profile saved
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

function ProfileLoader({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const [profile, setProfile] = useState<Profile>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadAccountProfile(userId)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  if (profile) return <ProfileEditor initial={profile} email={email} />;
  if (failed)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-text-secondary">
          Your profile couldn’t be loaded. Please try again.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFailed(false);
            setAttempt(attempt + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  return (
    <p role="status" className="py-8 text-sm text-text-secondary">
      Loading your profile…
    </p>
  );
}

export default function AccountProfile() {
  const { user, logout, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  if (loading) return <p role="status">Loading your account…</p>;
  if (!user) return null;
  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await logout();
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <section aria-label="Account management" className="min-w-0">
      <div
        role="group"
        className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6"
        aria-label="Signed-in account"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-text-secondary">
            Signed in as{" "}
            <span className="break-all font-medium text-text-primary">
              {user.email ?? "Email unavailable"}
            </span>
          </p>
          {user.emailVerified && (
            <p className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              Email verified
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
        {signOutError && (
          <p role="alert" className="mt-3 text-sm text-text-secondary">
            Couldn’t sign out. Please try again.
          </p>
        )}
      </div>
      <ProfileLoader key={user.uid} userId={user.uid} email={user.email} />
    </section>
  );
}
