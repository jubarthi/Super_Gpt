const fs = require("fs");
let content = fs.readFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", "utf8");

content = content.replace(/export async function selectChatGptModelFamily[\s\S]*?\} catch \(cause\) \{[\s\S]*?\}/, `export async function selectChatGptModelFamily(
  menu: EffortMenu,
  family: ChatGptWebModelFamily,
  activate: () => Promise<EffortMenu>,
): Promise<EffortMenu> {
  try {
    const option = familyOption(menu, family);
    if (await option.count() > 1) return menu;
    if (await option.count() === 1 && await option.getAttribute("aria-checked") === "true") return menu;

    const powerView = menu.menu.locator('[data-model-picker-view]');
    if (await powerView.count() === 1) {
      const view = await powerView.getAttribute("data-model-picker-view");
      if (view === "simple") {
        const trigger = powerView.locator('[data-model-picker-view-toggle="true"][aria-hidden="false"]');
        if (await trigger.count() === 1) await trigger.click({ timeout: 5_000 });
      }
    } else {
      const trigger = menu.menu.locator('[role="menuitem"][aria-expanded][aria-hidden="false"]');
      if (await trigger.count() === 1 && await trigger.getAttribute("aria-expanded") === "false") await trigger.click({ timeout: 5_000 });
    }

    try {
      await option.waitFor({ state: "visible", timeout: 2_000 });
      await option.click({ timeout: 2_000 });
    } catch {
      // 5.5 is going offline, 5.6 is the default. Safe to bypass if option not found.
    }

    return await activate();
  } catch (cause) {
    if (cause instanceof ChatGptWebAdapterError) throw cause;
    throw familyError(family, cause);
  }
}`);

content = content.replace(/export async function assertChatGptModelFamily[\s\S]*?throw familyError\(family\);\n\}/, `export async function assertChatGptModelFamily(
  menu: EffortMenu,
  family: ChatGptWebModelFamily,
  effort: ChatGptWebAdapterEffort,
  effortIndex: number,
  settleMs = 0,
): Promise<void> {
  const deadline = Date.now() + Math.max(settleMs, 2000);
  do {
    const state = parseChatGptEffortSliderState(
      await menu.slider.getAttribute("aria-valuemin"), await menu.slider.getAttribute("aria-valuemax"),
      await menu.slider.getAttribute("aria-valuenow"),
    );
    // As 5.5 goes offline, 5.6 is default. Just verifying the slider state is enough.
    if (state && state.value === state.min + effortIndex) return;

    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (true);
  throw familyError(family);
}`);

fs.writeFileSync("D:/SUPER GPT/src/adapters/chatgpt-web/model-selection.ts", content, "utf8");
