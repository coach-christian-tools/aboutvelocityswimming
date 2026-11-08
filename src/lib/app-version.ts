// A build-time constant, never a runtime timestamp or the last server response.
export const APP_VERSION =
  process.env.NEXT_PUBLIC_VELOCITY_BUILD_ID ?? "development";
