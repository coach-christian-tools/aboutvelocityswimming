import fs from "fs";
import path from "path";

export function getProductMockupImages(productName: string): string[] {
  try {
    const mockupsBase = path.join(process.cwd(), "public", "mockups");
    if (!fs.existsSync(mockupsBase)) {
      return [];
    }

    // Attempt exact match or case-insensitive match
    const entries = fs.readdirSync(mockupsBase);
    const matchedFolder = entries.find(
      (folder) =>
        folder.toLowerCase() === productName.toLowerCase() ||
        productName.toLowerCase().includes(folder.toLowerCase()) ||
        folder.toLowerCase().includes(productName.toLowerCase())
    );

    if (!matchedFolder) {
      return [];
    }

    const folderPath = path.join(mockupsBase, matchedFolder);
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => /\.(png|jpe?g|webp)$/i.test(file));

    // Sort to show front primary view first, then back, then angle views
    files.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      const aIsFront = aLower.includes("front") && !aLower.includes("right") && !aLower.includes("left");
      const bIsFront = bLower.includes("front") && !bLower.includes("right") && !bLower.includes("left");

      if (aIsFront && !bIsFront) return -1;
      if (!aIsFront && bIsFront) return 1;

      const aIsBack = aLower.includes("back");
      const bIsBack = bLower.includes("back");

      if (aIsBack && !bIsBack) return -1;
      if (!aIsBack && bIsBack) return 1;

      return aLower.localeCompare(bLower);
    });

    return files.map(
      (file) => `/mockups/${encodeURIComponent(matchedFolder)}/${encodeURIComponent(file)}`
    );
  } catch (err) {
    console.error(`Error reading mockups for ${productName}:`, err);
    return [];
  }
}
