const GEMINI_API_MODEL = "gemini-3-flash-preview";

const GEMINI_PROFILES = [
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "gemini-3-1", name: "Gemini 3.1" },
  { id: "gemini-3-1-pro", name: "Gemini 3.1 Pro" },
  { id: "gemini-3-5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3-6-flash", name: "Gemini 3.6 Flash" },
  { id: "gemini-3-7-flash", name: "Gemini 3.7 Flash" },
  { id: "gemini-3-8-flash", name: "Gemini 3.8 Flash" },
  { id: "gemini-4-hydrogen", name: "Gemini 4 Hydrogen" },
  { id: "gemini-4-argon", name: "Gemini 4 Argon" },
  { id: "gemini-4-carbon", name: "Gemini 4 Carbon" },
  { id: "gemini-4-neon", name: "Gemini 4 Neon" }
];

// Curated current Groq chat models.
// This excludes retired and speech-only model IDs.

const GROQ_MODELS = [
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B · Best overall"
  },
  {
    id: "qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B · Vision + reasoning"
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B · Fast"
  },
  {
    id: "allam-2-7b",
    name: "ALLaM 2 7B · English + Arabic"
  },
  {
    id: "openai/gpt-oss-safeguard-20b",
    name: "GPT OSS Safeguard 20B"
  }
];

export default function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=3600"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET."
    });
  }

  const gemini = GEMINI_PROFILES.map(profile => ({
    ...profile,
    provider: "Gemini",
    family: "Gemini",
    apiModel: GEMINI_API_MODEL
  }));

  const groq = GROQ_MODELS.map(model => ({
    ...model,
    provider: "Groq",
    family: "Groq"
  }));

  return res.status(200).json({
    success: true,
    groups: {
      Gemini: gemini,
      Groq: groq
    },
    models: [
      ...gemini,
      ...groq
    ]
  });
}
