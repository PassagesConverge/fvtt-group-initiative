/****************************************************************************************
 * carousel-integration.js — Integration with Combat Tracker Dock (Carousel)
 * --------------------------------------------------------------------------------------
 * This module intercepts the Carousel's sortedCombatants getter to show groups
 * as individual combatants while hiding group members.
 ****************************************************************************************/

import { MODULE_ID, log } from "./shared.js";
import { GroupManager } from "./class-objects.js";

/**
 * Initialize carousel integration
 * Wraps the CombatDock's sortedCombatants getter to filter combatants
 */
export function initCarouselIntegration() {
    try {
        const CarouselModule = game.modules.get("combat-tracker-dock");
        if (!CarouselModule?.active) {
            log(`[${MODULE_ID}] Combat Tracker Dock not active, skipping Carousel integration`);
            return;
        }

        const CombatDock = CONFIG.combatTrackerDock?.CombatDock;
        if (!CombatDock) {
            log(`[${MODULE_ID}] CombatDock class not found in CONFIG`);
            return;
        }

        // Get the original sortedCombatants getter
        const descriptor = Object.getOwnPropertyDescriptor(CombatDock.prototype, "sortedCombatants");
        if (!descriptor?.get) {
            log(`[${MODULE_ID}] Could not find sortedCombatants getter on CombatDock`);
            return;
        }

        const originalGetter = descriptor.get;

        // Replace with our wrapped getter
        Object.defineProperty(CombatDock.prototype, "sortedCombatants", {
            get() {
                const allCombatants = originalGetter.call(this);
                return filterCombatantsForCarousel(allCombatants, this.combat);
            },
            enumerable: descriptor.enumerable,
            configurable: descriptor.configurable,
        });

        log(`[${MODULE_ID}] ✅ Carousel integration initialized`);
    } catch (err) {
        console.error(`[${MODULE_ID}] Error initializing Carousel integration:`, err);
    }
}

/**
 * Filter combatants to show groups instead of group members
 * @param {Array} combatants - Original combatants array
 * @param {Combat} combat - The active combat
 * @returns {Array} Filtered combatants (groups visible, members hidden)
 */
function filterCombatantsForCarousel(combatants, combat) {
    if (!combat) return combatants;

    try {
        const groups = GroupManager.getGroups(combatants, combat);
        const result = [];

        // Add groups to the result
        for (const [groupId, groupData] of groups.entries()) {
            if (groupId === "ungrouped") continue; // Skip ungrouped

            // Create a virtual group combatant for the Carousel
            const groupCombatant = createGroupCombatantProxy(groupId, groupData, combat);
            result.push(groupCombatant);
        }

        // Add ungrouped members (those not in any group)
        const groupedMemberIds = new Set();
        for (const [groupId, groupData] of groups.entries()) {
            if (groupId !== "ungrouped") {
                groupData.members.forEach(m => groupedMemberIds.add(m.id));
            }
        }

        combatants.forEach(c => {
            if (!groupedMemberIds.has(c.id)) {
                result.push(c);
            }
        });

        log(`[${MODULE_ID}] Carousel view: ${result.length} items (${groups.size - 1} groups + ungrouped)`);
        return result;
    } catch (err) {
        console.error(`[${MODULE_ID}] Error filtering combatants for Carousel:`, err);
        return combatants; // Fallback to original if error
    }
}

/**
 * Create a proxy combatant object for a group
 * This makes groups appear like normal combatants to the Carousel
 */
function createGroupCombatantProxy(groupId, groupData, combat) {
    const flagGroups = foundry.utils.getProperty(combat, `flags.${MODULE_ID}.groups`) || {};
    const groupCfg = flagGroups[groupId] || {};
    const groupName = groupCfg.name ?? groupData.name ?? "Unnamed Group";

    // Calculate group initiative
    let groupInitiative = null;
    if (groupData.members.length > 0) {
        const allHaveInitiative = groupData.members.every(c => Number.isFinite(c.initiative));
        if (allHaveInitiative) {
            groupInitiative = combat.getFlag(MODULE_ID, `groups.${groupId}`)?.initiative;
            if (!Number.isFinite(groupInitiative)) {
                const vals = groupData.members.map(c => c.initiative);
                groupInitiative = Math.ceil(vals.reduce((a, b) => a + b, 0) / vals.length);
            }
        }
    }

    // Create a proxy object that mimics a combatant
    const groupImg = groupCfg.img || "icons/svg/combat.svg";
    console.log(`[${MODULE_ID}] Creating group proxy for ${groupId} with image:`, groupImg);
    const proxy = {
        id: `group-${groupId}`,
        _id: `group-${groupId}`,
        name: groupName,
        initiative: groupInitiative,
        actor: null,
        combat: combat,  // Direct reference to combat
        img: groupImg,
        flags: {
            [MODULE_ID]: {
                isGroupProxy: true,
                groupId: groupId,
            }
        },
        token: {
            id: `group-token-${groupId}`,
            name: groupName,
            img: groupImg,
            disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        },
        // Add flag to identify this as a group proxy
        getFlag(module, key) {
            if (module === MODULE_ID && key === "isGroupProxy") {
                return true;
            }
            if (module === MODULE_ID && key === "groupId") {
                return groupId;
            }
            if (module === MODULE_ID && key === "event") {
                return false;
            }
            return undefined;
        },
        setFlag() {
            // No-op for proxy
            return Promise.resolve();
        },
        // Mock parent reference (combatant.parent should return combat)
        get parent() {
            return combat;
        },
        // Check ownership
        get isOwner() {
            return true;
        },
        // Mock sort value
        sort: groupData.members.length > 0 
            ? Math.min(...groupData.members.map(c => c.sort ?? 0))
            : 0,
    };

    return proxy;
}
