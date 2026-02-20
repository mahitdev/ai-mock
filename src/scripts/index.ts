import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const configuredModel = import.meta.env.VITE_GEMINI_MODEL as string | undefined;
const genAI = new GoogleGenerativeAI(apiKey || "");

const resolveConfiguredModels = (model?: string): string[] => {
  if (!model) return [];

  const normalized = model.trim().toLowerCase();
  if (
    normalized === "gemini pro3" ||
    normalized === "gemini-pro3" ||
    normalized === "pro3"
  ) {
    // Alias support for user-friendly naming.
    return ["gemini-2.5-pro", "gemini-2.5-pro-latest", "gemini-1.5-pro-latest"];
  }

  return [model.trim()];
};

const configuredModels = resolveConfiguredModels(configuredModel);

const preferredModels = [
  ...configuredModels,
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-2.5-pro",
  "gemini-2.5-pro-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
].filter((m): m is string => Boolean(m));

const generationConfig = {
  temperature: 0.7,
  topP: 0.9,
  topK: 32,
  maxOutputTokens: 2048,
  responseMimeType: "application/json",
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

type ListModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

const listAvailableModels = async (): Promise<string[]> => {
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) return [];

    const data = (await response.json()) as ListModelsResponse;
    return (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name?.replace("models/", ""))
      .filter((m): m is string => Boolean(m));
  } catch {
    return [];
  }
};

let cachedModelList: string[] | null = null;

const normalizeModelId = (modelId: string) => modelId.replace(/^models\//, "");

const getCandidateModels = async (): Promise<string[]> => {
  if (cachedModelList) return cachedModelList;
  const available = await listAvailableModels();

  // Prefer what the API says is currently available for this key/account.
  // Fall back to curated defaults only if listing fails or returns empty.
  const orderedCandidates =
    available.length > 0 ? [...preferredModels, ...available] : preferredModels;

  cachedModelList = [...new Set(orderedCandidates.map(normalizeModelId))];
  return cachedModelList;
};

export const chatSession = {
  sendMessage: async (prompt: string) => {
    if (!apiKey) throw new Error("Missing VITE_GEMINI_API_KEY");

    const candidates = await getCandidateModels();
    let lastError: unknown = null;

    for (const candidate of candidates) {
      const modelId = normalizeModelId(candidate);
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const session = model.startChat({ generationConfig, safetySettings });
        return await session.sendMessage(prompt);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Gemini failed for models: ${candidates.join(", ")}. ${
        lastError instanceof Error ? lastError.message : "Unknown error"
      }`
    );
  },
};
