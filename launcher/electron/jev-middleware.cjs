/**
 * SUPER GPT — Jev Intelligence Middleware
 * Uses TypeSafe System One (Jev) via the official SDK
 */
const { TypeSafe } = require("@typesafe-ai/sdk");

function createJevMiddleware({ logger }) {
  let client = null;
  let enabled = false;

  function configure({ jevApiKey, jevEnabled }) {
    if (jevApiKey && jevEnabled) {
      try {
        client = new TypeSafe({ apiKey: jevApiKey });
        enabled = true;
        logger.info("jev.configured", { enabled: true });
      } catch (e) {
        client = null;
        enabled = false;
        logger.warn("jev.configure_failed", { error: e.message });
      }
    } else {
      client = null;
      enabled = false;
    }
  }

  function isEnabled() {
    return enabled && client !== null;
  }

  async function isCommandSafe(command) {
    if (!isEnabled()) return { safe: true, confidence: 1.0 };
    
    try {
      // Create a timeout promise to not block the terminal forever
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TypeSafe request timed out")), 5000)
      );

      const destructiveCall = client.noul({
        state: { command },
        instructions: "This command could permanently delete files, format drives, drop databases, or cause irreversible damage to the system"
      });

      const malformedCall = client.noul({
        state: { command },
        instructions: "This command has syntax errors, missing arguments, or references non-existent paths that would cause it to fail"
      });

      // Race against the timeout
      const [destructiveRes, malformedRes] = await Promise.race([
        Promise.all([destructiveCall, malformedCall]),
        timeoutPromise
      ]);

      const destructiveProb = destructiveRes.noul ?? 0;
      const malformedProb = malformedRes.noul ?? 0;
      
      const safe = destructiveProb < 0.7 && malformedProb < 0.8;
      
      return {
        safe,
        confidence: 1 - destructiveProb,
        destructiveProb,
        malformedProb,
      };
    } catch (error) {
      logger.warn("jev.isCommandSafe_error", { message: error.message });
      // Fail open so we don't break the user's terminal
      return { safe: true, confidence: 0, error: error.message };
    }
  }

  return {
    configure,
    isEnabled,
    isCommandSafe,
  };
}

module.exports = { createJevMiddleware };
