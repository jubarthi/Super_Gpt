const fs = require("fs");
let content = fs.readFileSync("D:/SUPER GPT/src/chatgpt-web-models.ts", "utf8");
content = content.replace(/codexEffort: "high",\s*adapterEffort: "high",\s*supportedCodexEfforts: \["medium", "high", "xhigh"\],/g, `codexEffort: "low",
      adapterEffort: "low",
      supportedCodexEfforts: ["low", "medium", "high", "xhigh"],`);
content = content.replace(/description: "GPT-5.6 Sol through ChatGPT with Medium, High, or account-supported Extra High reasoning.",/g, `description: "GPT-5.6 Sol through ChatGPT with Instant, Medium, High, or account-supported Extra High reasoning.",`);
fs.writeFileSync("D:/SUPER GPT/src/chatgpt-web-models.ts", content, "utf8");
