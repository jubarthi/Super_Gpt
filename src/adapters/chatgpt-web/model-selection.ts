import { activateChatGptEffortMenu, parseChatGptEffortSliderState } from "../../chatgpt-session";
import type { ChatGptWebAdapterEffort, ChatGptWebModelFamily } from "../../chatgpt-web-models";
import { ChatGptWebAdapterError } from "./adapter-error";

type EffortMenu = Awaited<ReturnType<typeof activateChatGptEffortMenu>>;

function familyError(family: ChatGptWebModelFamily, cause?: unknown): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(
    `ChatGPT model ${family} could not be selected and verified. The pending message was not sent. Check the model in the browser; if ChatGPT uses an unsupported language, select English in Settings \u2192 General \u2192 Language and reload it.`,
    { status: 400, errorType: "invalid_request_error", code: "model_version_unavailable", retryable: false, cause },
  );
}

function familyOption(menu: EffortMenu, family: ChatGptWebModelFamily) {
  return menu.menu.getByRole("menuitemradio", {
    // No trailing $ anchor: ChatGPT may append availability text or subtitles to the
    // accessible name (e.g. "GPT-5.6 Sol\nDispon\u00edvel at\u00e9..."). exact is omitted so the
    // regex controls matching. 6.x versions (6.1, 6.2\u2026) and Terra/Luna variants are accepted.
    name: family === "5.6" ? /^(?:GPT[-\s]?)?5\.6(?:\s+(?:Sol|Terra|Luna))?(?:\s+Pro)?(?:\s|$)/i
      // Simplified/Traditional Chinese and Japanese share \u6700\u65b0; Korean uses \ucd5c\uc2e0.
      : /^(?:Latest|\u6700\u65b0|\ucd5c\uc2e0|(?:GPT[-\s]?)?6(?:\.\d+)?(?:\s+(?:Astra|Sol|Luna))?(?:\s+Pro)?)(?:\s|$)/i,
    includeHidden: true,
  });
}

/** Model and effort are separate browser controls; a generic Pro label proves neither family. */
export async function selectChatGptModelFamily(
  menu: EffortMenu,
  family: ChatGptWebModelFamily,
  activate: () => Promise<EffortMenu>,
): Promise<EffortMenu> {
  try {
    const option = familyOption(menu, family);
    const optionCount = await option.count();

    // OpenAI removed model radio buttons when 5.5 went offline. 5.6 is the only/default model.
    // If no radio buttons exist at all, skip model selection entirely and proceed to effort.
    if (optionCount === 0) return menu;

    if (optionCount > 1) throw familyError(family);
    if (optionCount === 1 && await option.getAttribute("aria-checked") === "true") return menu;

    // The attached radio rows are inert while this composer-owned advanced view is collapsed.
    const powerView = menu.menu.locator('[data-model-picker-view]');
    if (await powerView.count() === 1) {
      const view = await powerView.getAttribute("data-model-picker-view");
      if (view === "simple") {
        const trigger = powerView.locator('[data-model-picker-view-toggle="true"][aria-hidden="false"]');
        if (await trigger.count() !== 1) throw familyError(family);
        await trigger.click({ timeout: 5_000 });
      } else if (view !== "advanced") throw familyError(family);
    } else {
      const trigger = menu.menu.locator('[role="menuitem"][aria-expanded][aria-hidden="false"]');
      if (await powerView.count() !== 0 || await trigger.count() !== 1) throw familyError(family);
      if (await trigger.getAttribute("aria-expanded") === "false") await trigger.click({ timeout: 5_000 });
    }
    await option.waitFor({ state: "visible", timeout: 5_000 });
    await option.click({ timeout: 5_000 });
    // Choosing a family returns the open picker to its slider. Keep that surface:
    // Escape followed by an immediate reopen races the outgoing menu's cleanup.
    // Activation reuses the open menu and verifies its owner before returning it.
    const selected = await activate();
    const deadline = Date.now() + 1_000;
    do {
      const current = familyOption(selected, family);
      if (await current.count() > 1) throw familyError(family);
      if (await current.count() === 1 && await current.getAttribute("aria-checked") === "true") return selected;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw familyError(family);
  } catch (cause) {
    if (cause instanceof ChatGptWebAdapterError) throw cause;
    throw familyError(family, cause);
  }
}

export function chatGptModelFamilyMatches(
  descriptions: readonly string[],
  family: ChatGptWebModelFamily,
  effort: ChatGptWebAdapterEffort,
): boolean {
  // Latest uses 5.6 for the existing lower-effort multipart acknowledgements and 6 for Pro.
  // Never interpret a future Latest Pro model as 6, or a lower effort as the final Pro response.
  const expectedMajor = family === "6" && effort !== "max" ? "5" : family === "6" ? "6" : "5";
  const states = descriptions.flatMap(text => {
    // Capture version (e.g. 5.6, 6.1) and name (Sol, Astra, Terra, Luna)
    const match = /^(?:GPT[-\s]?)?(\d+(?:\.\d+)?)(?:\s+(Sol|Astra|Terra|Luna))?\s+([^,\uff0c]+)(?:[,\uff0c]|$)/i
      .exec(text.replace(/\s+/g, " ").trim());
    return match ? [{ version: match[1], name: match[2]?.toLowerCase(), mode: match[3]!.trim() }] : [];
  });
  // If no descriptions could be parsed (e.g. OpenAI changed format), allow it through
  if (states.length === 0) return true;
  return states.every(state => state.version.startsWith(expectedMajor)
    // Relaxed name requirement to support new model variants.
    && (effort === "max" ? /^Pro$/i.test(state.mode) : !/^Pro$/i.test(state.mode)));
}

export async function assertChatGptModelFamily(
  menu: EffortMenu,
  family: ChatGptWebModelFamily,
  effort: ChatGptWebAdapterEffort,
  effortIndex: number,
  settleMs = 0,
): Promise<void> {
  const deadline = Date.now() + Math.max(settleMs, 2_000);
  do {
    const option = familyOption(menu, family);
    const optionCount = await option.count();

    // If radio buttons don't exist (OpenAI removed them), skip the model check
    // and only validate the effort slider position.
    const checked = optionCount === 0
      ? true
      : optionCount === 1 && await option.getAttribute("aria-checked") === "true";

    const state = parseChatGptEffortSliderState(
      await menu.slider.getAttribute("aria-valuemin"), await menu.slider.getAttribute("aria-valuemax"),
      await menu.slider.getAttribute("aria-valuenow"),
    );
    const descriptions = await menu.slider.locator("xpath=ancestor::*[@role='menuitem'][1]").evaluate(element => (
      (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
        .map(id => element.ownerDocument.getElementById(id)?.textContent ?? "")
    ));
    if (checked && state && state.value === state.min + effortIndex
      && chatGptModelFamilyMatches(descriptions, family, effort)) return;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (true);
  throw familyError(family);
}
