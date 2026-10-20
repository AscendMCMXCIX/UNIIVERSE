/**
 * Browser tests only: with UNIIVERSE_FAKE_SCOUT_OCR=1 on the in-memory demo database (never a real
 * deployment) Clash Scout reads screenshots with a stand-in instead of downloading Tesseract.
 */
export function scoutRecognition(): "real" | "fake" {
  return process.env.UNIIVERSE_FAKE_SCOUT_OCR === "1" && process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL ? "fake" : "real";
}
