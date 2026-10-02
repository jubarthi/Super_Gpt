/**
 * SUPER GPT — Jev Intelligence Middleware
 * Uses TypeSafe System One (Jev) for fast semantic judgments:
 * - Command safety verification (Noul)
 * - Action routing (Choice)
 * - Context relevance scoring (Score)
 */

const JEV_API_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";

function createJevMiddleware({ logger }) {
  let apiKey = null;
  let enabled = false;

  function configure({ jevApiKey, jevEnabled }) {
    apiKey = jevApiKey || null;
    enabled = jevEnabled === true && apiKey !== null;
    if (enabled) {
      logger.info("jev.configured", { enabled: true });
    }
  }

  function isEnabled() {
    return enabled;
  }

  async function judge(state, questions) {
    if (!enabled || !apiKey) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(JEV_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: JEV_MODEL,
          state,
          questions,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        logger.warn("jev.request_failed", { status: response.status });
        return null;
      }
      const result = await response.json();
      return result.answers || null;
    } catch (error) {
      logger.warn("jev.request_error", { message: error.message });
      return null;
    }
  }

  async function isCommandSafe(command) {
    if (!enabled) return { safe: true, confidence: 1.0 };
    const answers = await judge(
      { command, context: "Terminal command to be executed on user machine" },
      {
        is_destructive: {
          type: "noul",
          instructions: "This command could permanently delete files, format drives, drop databases, or cause irreversible damage to the system",
        },
        is_malformed: {
          type: "noul",
          instructions: "This command has syntax errors, missing arguments, or references non-existent paths that would cause it to fail",
        },
      }
    );
    if (!answers) return { safe: true, confidence: 0 };
    const destructiveProb = answers.is_destructive?.noul ?? 0;
    const malformedProb = answers.is_malformed?.noul ?? 0;
    const safe = destructiveProb < 0.7 && malformedProb < 0.8;
    return {
      safe,
      confidence: 1 - destructiveProb,
      destructiveProb,
      malformedProb,
    };
  }

  async function routeAction(userMessage) {
    if (!enabled) return { route: "chatgpt", confidence: 0 };
    const answers = await judge(
      { message: userMessage },
      {
        intent: {
          type: "choice",
          instructions: "What is the primary intent of this message?",
          options: {
            chat: "General conversation, questions, or explanations",
            code_edit: "Create, modify, or debug code files",
            terminal: "Run a command in the terminal or shell",
            file_read: "Read, search, or inspect files",
          },
        },
      }
    );
    if (!answers) return { route: "chatgpt", confidence: 0 };
    return {
      route: answers.intent?.choice ?? "chatgpt",
      confidence: answers.intent?.confidence ?? 0,
      probabilities: answers.intent?.probabilities ?? {},
    };
  }

  async function scoreRelevance(context, query) {
    if (!enabled) return { score: "high", confidence: 0 };
    const answers = await judge(
      { context, query },
      {
        relevance: {
          type: "score",
          instructions: "How relevant is this context to answering the query?",
          levels: ["irrelevant", "low", "medium", "high", "critical"],
        },
      }
    );
    if (!answers) return { score: "high", confidence: 0 };
    return {
      score: answers.relevance?.score ?? "high",
      confidence: answers.relevance?.confidence ?? 0,
    };
  }

  return {
    configure,
    isEnabled,
    judge,
    isCommandSafe,
    routeAction,
    scoreRelevance,
  };
}

module.exports = { createJevMiddleware };
