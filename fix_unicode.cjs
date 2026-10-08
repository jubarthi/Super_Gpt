const fs = require("fs");
let content = fs.readFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", "utf8");
content = content.replace(/\(\?\:Latest\|\?\?\|\?\?\|\(\?\:GPT\[-\\s\]\?\)\?6\)/g, "(?:Latest|??|??|(?:GPT[-\\s]?)?6)");
fs.writeFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", content, "utf8");
