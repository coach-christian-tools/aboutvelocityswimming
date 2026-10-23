/** Local-only fixture; the example.test source is intentionally synthetic. */
export const syntheticStandard = {
  id: "test-standard",
  category: "motivational",
  name: "Synthetic test standards",
  governingBody: "Team",
  seasonYears: "2026",
  effectiveDate: "2026-01-01",
  expirationDate: "2026-12-31",
  sourceUrl: "https://example.test/synthetic-standards",
  cuts: {
    SCY: {
      F: {
        "13-14": {
          "100_FR_SCY": {
            cutsByTier: [
              { tierName: "A", timeMs: 65000, timeDisplay: "1:05.00" },
            ],
          },
        },
      },
    },
  },
};
