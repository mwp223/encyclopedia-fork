
const GEMINI_API_MODEL = "gemini-3-flash-preview";

const CLOUDFLARE_MODEL =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const GEMINI_PROFILES = {
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-1": "Gemini 3.1",
  "gemini-3-1-pro": "Gemini 3.1 Pro",
  "gemini-3-5-flash": "Gemini 3.5 Flash",
  "gemini-3-6-flash": "Gemini 3.6 Flash",
  "gemini-3-7-flash": "Gemini 3.7 Flash",
  "gemini-3-8-flash": "Gemini 3.8 Flash",
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-4-argon": "Gemini 4 Argon",
  "gemini-4-carbon": "Gemini 4 Carbon",
  "gemini-4-neon": "Gemini 4 Neon"
};

const GROQ_MODELS = {
  "openai/gpt-oss-120b": "GPT OSS 120B",
  "qwen/qwen3.8-27b": "Qwen 3.8 27B",
  "openai/gpt-oss-20b": "GPT OSS 20B",
  "allam-2-7b": "ALLaM 2 7B",
  "openai/gpt-oss-safeguard-20b": "GPT OSS Safeguard 20B"
};

function parseBody(body) {
  if (body && typeof body === "object") return body;

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(
        "The request body is not valid JSON."
      );
    }
  }

  return {};
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error("Messages must be an array.");
  }

  return messages
    .filter(item =>
      item &&
      ["user", "assistant"].includes(item.role)
    )
    .slice(-30);
}

function geminiContents(messages) {
  return messages.map(message => {
    const rawParts = Array.isArray(message.content)
      ? message.content
      : [{
          type: "text",
          text: String(message.content ?? "")
        }];

    const parts = rawParts.map(part => {
      if (!part || typeof part !== "object") {
        throw new Error(
          "A message contains an invalid content part."
        );
      }

      if (part.type === "text") {
        return {
          text: String(part.text ?? "").slice(0, 100000)
        };
      }

      if (part.type === "image_url") {
        const url = part.image_url?.url || "";

        const match = url.match(
          /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/
        );

        if (!match) {
          throw new Error(
            "An image attachment has an unsupported format."
          );
        }

        return {
          inlineData: {
            mimeType: match[1],
            data: match[2].replace(/\s/g, "")
          }
        };
      }

      throw new Error(
        "A message contains an unsupported attachment type."
      );
    });

    if (!parts.length) {
      throw new Error("A message cannot be empty.");
    }

    return {
      role: message.role === "assistant"
        ? "model"
        : "user",
      parts
    };
  });
}

function groqMessages(messages, model, systemInstruction) {
  const supportsImages =
    model === "qwen/qwen3.8-27b";

  const output = [{
    role: "system",
    content: systemInstruction && systemInstruction.trim()
      ? String(systemInstruction).slice(0, 50000)
      : (
          "You are an AI assistant in AI Service. " +
          "Be helpful, accurate, clear, and natural. " +
          "Use Markdown when it improves readability."
        )
  }];

  for (const message of messages) {
    const rawParts = Array.isArray(message.content)
      ? message.content
      : [{
          type: "text",
          text: String(message.content ?? "")
        }];

    if (
      rawParts.some(part => part?.type === "image_url") &&
      !supportsImages
    ) {
      throw new Error(
        "Image input is currently supported in Groq only with Qwen 3.8 27B. Switch to that model or remove the image."
      );
    }

    const content = rawParts.map(part => {
      if (part?.type === "text") {
        return {
          type: "text",
          text: String(part.text ?? "").slice(0, 100000)
        };
      }

      if (part?.type === "image_url") {
        const url = part.image_url?.url || "";

        if (
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(url)
        ) {
          throw new Error(
            "This image format is not supported by the selected Groq model."
          );
        }

        return {
          type: "image_url",
          image_url: { url }
        };
      }

      throw new Error(
        "A message contains an unsupported attachment type."
      );
    });

    output.push({
      role: message.role,
      content:
        content.length === 1 &&
        content[0].type === "text"
          ? content[0].text
          : content
    });
  }

  return output;
}

function cloudflareMessages(messages, systemInstruction) {
  const output = [{
    role: "system",
    content: systemInstruction && systemInstruction.trim()
      ? String(systemInstruction).slice(0, 50000)
      : (
          "You are an AI assistant in AI Service. " +
          "Be helpful, accurate, clear, and natural. " +
          "Use Markdown when it improves readability."
        )
  }];

  for (const message of messages) {
    const rawParts = Array.isArray(message.content)
      ? message.content
      : [{
          type: "text",
          text: String(message.content ?? "")
        }];

    if (
      rawParts.some(part => part?.type === "image_url")
    ) {
      throw new Error(
        "Cloudflare currently supports text messages only in AI Service. Switch to Gemini or a supported Groq model to send images."
      );
    }

    const text = rawParts
      .filter(part => part?.type === "text")
      .map(part => String(part.text ?? ""))
      .join("\n")
      .slice(0, 100000);

    if (!text.trim()) {
      throw new Error(
        "Cloudflare requires a text message."
      );
    }

    output.push({
      role: message.role,
      content: text
    });
  }

  return output;
}

async function fetchJson(
  url,
  options,
  timeoutMs = 55000
) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(
      url,
      {
        ...options,
        signal: controller.signal
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `The AI provider returned an unreadable response (${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        data.errors?.[0]?.message ||
        data.error?.message ||
        data.error ||
        `The AI provider request failed (${response.status}).`
      );
    }

    return data;

  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const body = parseBody(req.body);

    const provider = String(
      body.provider || "Gemini"
    ).toLowerCase();

    const model = String(body.model || "");

    const messages = normalizeMessages(body.messages);

    const systemInstruction = typeof body.systemInstruction === "string"
      ? body.systemInstruction
      : "";

    if (
      !messages.length ||
      !messages.some(message => message.role === "user")
    ) {
      return res.status(400).json({
        success: false,
        error: "Enter a message before sending."
      });
    }

    /* =====================================
       GEMINI
    ===================================== */

    if (["gemini", "google"].includes(provider)) {
      if (
        !Object.prototype.hasOwnProperty.call(
          GEMINI_PROFILES,
          model
        )
      ) {
        return res.status(400).json({
          success: false,
          error: "Please select a valid Gemini profile."
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error:
            "GEMINI_API_KEY is missing from Vercel Environment Variables. Add it to the Production environment and redeploy."
        });
      }

      const profileName = GEMINI_PROFILES[model];

      const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_API_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: systemInstruction && systemInstruction.trim()
                  ? String(systemInstruction).slice(0, 50000)
                  : (
                      `You are an AI assistant in AI Service. ` +
                      `The selected profile is ${profileName}. ` +
                      `If asked which profile is selected, use that exact profile name. ` +
                      `Be helpful, accurate, clear, and natural. ` +
                      `Use Markdown when useful.`
                    )
              }]
            },
            contents: geminiContents(messages),
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192
            }
          })
        }
      );

      const reply = (
        data.candidates?.[0]?.content?.parts || []
      )
        .map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        const reason =
          data.candidates?.[0]?.finishReason;

        throw new Error(
          reason
            ? `Gemini did not provide a text response (${reason}).`
            : "Gemini returned an empty response."
        );
      }

      return res.status(200).json({
        success: true,
        reply,
        provider: "Gemini",
        model: profileName
      });
    }

    /* =====================================
       GROQ
    ===================================== */

    if (provider === "groq") {
      if (
        !Object.prototype.hasOwnProperty.call(
          GROQ_MODELS,
          model
        )
      ) {
        return res.status(400).json({
          success: false,
          error: "Please select one of the listed Groq models."
        });
      }

      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error:
            "GROQ_API_KEY is missing from Vercel Environment Variables. Add it to the Production environment and redeploy."
        });
      }

      const data = await fetchJson(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: groqMessages(messages, model, systemInstruction),
            temperature: 0.7,
            max_tokens: 4096
          })
        }
      );

      const reply = String(
        data.choices?.[0]?.message?.content || ""
      ).trim();

      if (!reply) {
        throw new Error(
          "Groq returned an empty response."
        );
      }

      return res.status(200).json({
        success: true,
        reply,
        provider: "Groq",
        model: GROQ_MODELS[model]
      });
    }

    /* =====================================
       CLOUDFLARE WORKERS AI
    ===================================== */

    if (
      ["cloudflare", "workers ai", "workers-ai"].includes(provider)
    ) {
      if (
        model !== CLOUDFLARE_MODEL &&
        model !== "llama-3.3-70b-instruct-fp8-fast"
      ) {
        return res.status(400).json({
          success: false,
          error: "Please select the supported Cloudflare model."
        });
      }

      const apiToken =
        process.env.CLOUDFLARE_API_TOKEN;

      const accountId =
        process.env.CLOUDFLARE_ACCOUNT_ID;

      if (!apiToken || !accountId) {
        return res.status(500).json({
          success: false,
          error:
            "Cloudflare credentials are missing. Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Vercel Environment Variables."
        });
      }

      const data = await fetchJson(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLOUDFLARE_MODEL}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            messages: cloudflareMessages(messages, systemInstruction),
            temperature: 0.7,
            max_tokens: 4096
          })
        }
      );

      const reply = String(
        data.result?.response || ""
      ).trim();

      if (!reply) {
        throw new Error(
          "Cloudflare returned an empty response."
        );
      }

      return res.status(200).json({
        success: true,
        reply,
        provider: "Cloudflare",
        model: "Llama 3.3 70B"
      });
    }

    return res.status(400).json({
      success: false,
      error: "Unknown provider. Choose Gemini, Groq, or Cloudflare."
    });

  } catch (error) {
    console.error(
      "AI Service chat route error:",
      error
    );

    const message =
      error?.name === "AbortError"
        ? "The AI provider took too long to respond. Please try again."
        : (
            error?.message ||
            "An unexpected server error occurred."
          );

    return res.status(500).json({
      success: false,
      error: message
    });
  }
}
