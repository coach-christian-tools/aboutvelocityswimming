import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

export const client = createClient({
  projectId: "nic7c4qj",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: false, // Set to false if you want to ensure fresh data
});

const builder = imageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
