import { activateChatGptEffortMenu, parseChatGptEffortSliderState } from "../../chatgpt-session";
import type { ChatGptWebAdapterEffort, ChatGptWebModelFamily } from "../../chatgpt-web-models";
import { ChatGptWebAdapterError } from "./adapter-error";

type EffortMenu = Awaited<ReturnType<typeof activateChatGptEffortMenu>>;

function familyError(family: ChatGptWebModelFamily, cause?: unknown): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(
    `ChatGPT model ${family} could not be selected and verified. The pending message was not sent. Check the model in the browser; if ChatGPT uses an unsupported language, select English in Settings â†’ General â†’ Language and reload it.`,
    { status: 400, errorType: "invalid_request_error", code: "model_version_unavailable", retryable: false, cause },
  );
}

function familyOption(menu: EffortMenu, family: ChatGptWebModelFamily) {
  return menu.menu.getByRole("menuitemradio", {
    // No trailing $ anchor: ChatGPT may append availability text or subtitles to the
    // accessible name (e.g. "GPT-5.6 Sol\nDisponÃ­vel atÃ©..."). exact is omitted so the
    // regex controls matching. 6.x versions (6.1, 6.2â€¦) and Terra/Luna variants are accepted.
    name: family === "5.6" ? /^(?:GPT[-\s]?)?5\.6(?:\s+(?:Sol|Terra|Luna))?(?:\s+Pro)?(?:\s|$)/i
      // Simplified/Traditional Chinese and Japanese share æœ€æ–°; Korean uses ìµœì‹ .
      : /^(?:Latest|æœ€æ–°|ìµœì‹ |(?:GPT[-\s]?)?6(?:\.\d+)?(?:\s+(?:Astra|Sol|Luna))?(?:\s+Pro)?)(?:\s|$)/i,
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
    if (await option.count() > 1) throw familyError(family);
    if (await option.count() === 1 && await option.getAttribute("aria-checked") === "true") return menu;
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
      
      const trigger = selected.menu.locator('[role="menuitem"][aria-expanded]');
      if (await trigger.count() === 1) {
        const text = await trigger.textContent() ?? "";
        if (family === "5.6" && /(?:GPT[-\s]?)?5\.6/i.test(text)) return selected;
        if (family === "6" && /(?:Latest|最新|최신|(?:GPT[-\s]?)?6)/i.test(text)) return selected;
      }
      
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
    const match = /^(?:GPT[-\s]?)?(\d+(?:\.\d+)?)(?:\s+(Sol|Astra|Terra|Luna))?\s+([^,ï¼Œ]+)(?:[,ï¼Œ]|$)/i
      .exec(text.replace(/\s+/g, " ").trim());
    return match ? [{ version: match[1], name: match[2]?.toLowerCase(), mode: match[3]!.trim() }] : [];
  });
  return states.length > 0 && states.every(state => state.version.startsWith(expectedMajor)
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
  const deadline = Date.now() + settleMs;
  do {
    const option = familyOption(menu, family);
    let checked = await option.count() === 1 && await option.getAttribute("aria-checked") === "true";
    
    if (!checked) {
      const trigger = menu.menu.locator('[role="menuitem"][aria-expanded]');
      if (await trigger.count() === 1) {
        const text = await trigger.textContent() ?? "";
        if (family === "5.6" && /(?:GPT[-\s]?)?5\.6/i.test(text)) checked = true;
        else if (family === "6" && /(?:Latest|最新|최신|(?:GPT[-\s]?)?6)/i.test(text)) checked = true;
      }
    }

    const state = parseChatGptEffortSliderState(
      await menu.slider.getAttribute("aria-valuemin"), await menu.slider.getAttribute("aria-valuemax"),
      await menu.slider.getAttribute("aria-valuenow"),
    );
    const descriptions = await menu.slider.locator("xpath=ancestor::*[@role='menuitem'][1]").evaluate(element => (
      (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
        .map(id => element.ownerDocument.getElementById(id)?.textContent ?? "")
    ));
    const matchesDescription = descriptions.length > 0 ? chatGptModelFamilyMatches(descriptions, family, effort) : true;

    if (checked && state && state.value === state.min + effortIndex && matchesDescription) return;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (true);
  throw familyError(family);
}


