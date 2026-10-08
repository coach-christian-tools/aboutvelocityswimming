import socialImage from "@/lib/social-image";

// Keep the original public URL without making this image metadata for every root layout.
export const dynamic = "force-static";
export const runtime = "nodejs";

export async function GET() {
  return socialImage();
}
