import { MODULE_ID, log } from "./shared.js";
import { registerSettings } from "./settings.js";
import { onDeleteCombat, onCreateCombatant, onUpdateCombat, combatTrackerRendering } from "./combat-tracker.js";
import { groupHeaderRendering } from "./group-header-rendering.js";
import { GroupManager, GroupContextMenuManager } from "./class-objects.js";
import { overrideRollMethods } from "./rolling-overrides.js";
import { initCarouselIntegration } from "./carousel-integration.js";
import { initMultiTokenEffects } from "./multi-token-effects.js";

// Bind hooks in main.js — logic is exported from hooks.js
Hooks.once("init", () => {
    try {
        registerSettings();
    } catch (err) {
        console.error(`[${MODULE_ID}] Error registering settings:`, err);
    }
});

Hooks.on("deleteCombat", onDeleteCombat);
Hooks.on("createCombatant", onCreateCombatant);
Hooks.on("updateCombat", onUpdateCombat);

Hooks.once("ready", () => {
    try {
        groupHeaderRendering();
    } catch (err) {
        console.error(`[${MODULE_ID}] Error in groupHeaderRendering:`, err);
    }
});

Hooks.once("ready", () => {
    try {
        overrideRollMethods();
    } catch (err) {
        console.error(`[${MODULE_ID}] Error in overrideRollMethods:`, err);
    }
});

Hooks.once("ready", () => {
    try {
        initCarouselIntegration();
    } catch (err) {
        console.error(`[${MODULE_ID}] Error initializing Carousel integration:`, err);
    }
});

Hooks.once("ready", () => {
    try {
        initMultiTokenEffects();
    } catch (err) {
        console.error(`[${MODULE_ID}] Error initializing multi-token effects:`, err);
    }
});

Hooks.on("renderCombatTracker", combatTrackerRendering);

Hooks.on("updateCombatant", async (combatant, changes) => {
    // 0️⃣ Bail if we’re already inside finalize or token-drag shortcut
    if (GroupManager.isFinalizing || combatant._skipFinalize) return;
    if (!("initiative" in changes)) return;

    const groupId = combatant.getFlag(MODULE_ID, "groupId");
    if (!groupId || groupId === "ungrouped") return;

    const combat = combatant.parent;

    // 1️⃣ Skip if this was triggered by a header roll
    const skip = await combat.getFlag(MODULE_ID, `skipFinalize.${groupId}`);
    if (skip) return;

    // 2️⃣ Finalize normally if no skip flag
    await GroupManager.finalizeGroupInitiative(combat, groupId);
});



console.log(`${MODULE_ID} | Core hooks registered.`);
