const fs = require("fs");
let content = fs.readFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", "utf8");
content = content.replace(/\}\r?\n\}\r?\n\}\r?\n\r?\nexport function chatGptModelFamilyMatches/g, `}\n\nexport function chatGptModelFamilyMatches`);
fs.writeFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", content, "utf8");
