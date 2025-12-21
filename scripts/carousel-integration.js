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
    // Helper that performs the actual wrapping for a given CombatDock class
    function wrapCombatDockClass(CombatDockClass) {
        try {
            if (!CombatDockClass || CombatDockClass.prototype.__squadSCIWrapped) return false;
            const descriptor = Object.getOwnPropertyDescriptor(CombatDockClass.prototype, "sortedCombatants");
            if (!descriptor?.get) {
                log(`[${MODULE_ID}] Could not find sortedCombatants getter on CombatDock`);
                return false;
            }
            const originalGetter = descriptor.get;
            Object.defineProperty(CombatDockClass.prototype, "sortedCombatants", {
                get() {
                    const allCombatants = originalGetter.call(this);
                    return filterCombatantsForCarousel(allCombatants, this.combat);
                },
                enumerable: descriptor.enumerable,
                configurable: descriptor.configurable,
            });
            // Mark wrapped to avoid double-wrapping
            CombatDockClass.prototype.__squadSCIWrapped = true;
            log(`[${MODULE_ID}] ✅ Carousel integration initialized (wrapped CombatDock)`);
            return true;
        } catch (err) {
            console.error(`[${MODULE_ID}] Error wrapping CombatDock:`, err);
            return false;
        }
    }

    try {
        const CarouselModule = game.modules.get("combat-tracker-dock");
        if (!CarouselModule?.active) {
            log(`[${MODULE_ID}] Combat Tracker Dock not active, skipping Carousel integration`);
            return;
        }

        // If the Combat Dock class is already registered on CONFIG, wrap it immediately.
        if (CONFIG.combatTrackerDock?.CombatDock) {
            wrapCombatDockClass(CONFIG.combatTrackerDock.CombatDock);
        }

        // Also listen for the module's init hook in case it registers later.
        Hooks.on("combat-tracker-dock-init", (cfg) => {
            if (cfg?.CombatDock) wrapCombatDockClass(cfg.CombatDock);
        });

        // Refresh carousel when a combatant's groupId changes (moved into/out of group)
        Hooks.on("updateCombatant", (combatant, changes) => {
            // Check if any flags changed that might affect groupId (both setFlag and unsetFlag)
            const flagsChanged = foundry.utils.getProperty(changes, `flags.${MODULE_ID}`) !== undefined;
            if (flagsChanged) {
                log(`[${MODULE_ID}] Combatant flags changed, refreshing carousel`);
                if (ui.combatDock) {
                    ui.combatDock.setupCombatants();
                }
            }
        });

        // Wrap Combat.rollInitiative to handle group proxy IDs
        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register(
                MODULE_ID,
                "Combat.prototype.rollInitiative",
                async function(wrapped, ids, options = {}) {
                    // Separate group proxy IDs from real combatant IDs
                    const groupIds = [];
                    const realIds = [];

                    for (const id of ids) {
                        if (id.startsWith("group-")) {
                            // Extract the actual groupId from "group-gr-xxxxx"
                            const actualGroupId = id.replace("group-", "");
                            groupIds.push(actualGroupId);
                        } else {
                            realIds.push(id);
                        }
                    }

                    // Roll initiative for groups using GroupManager
                    for (const groupId of groupIds) {
                        log(`[${MODULE_ID}] Rolling initiative for group ${groupId}`);
                        await GroupManager.rollGroupAndApplyInitiative(this, groupId, { mode: "normal" });
                    }

                    // Roll initiative for real combatants normally
                    if (realIds.length > 0) {
                        return wrapped.call(this, realIds, options);
                    }
                },
                "MIXED"
            );
            log(`[${MODULE_ID}] ✅ Combat.rollInitiative wrapped for group support (using libWrapper)`);
        } else {
            // Fallback without libWrapper
            const originalRollInitiative = Combat.prototype.rollInitiative;
            Combat.prototype.rollInitiative = async function(ids, options = {}) {
                // Separate group proxy IDs from real combatant IDs
                const groupIds = [];
                const realIds = [];

                for (const id of ids) {
                    if (id.startsWith("group-")) {
                        // Extract the actual groupId from "group-gr-xxxxx"
                        const actualGroupId = id.replace("group-", "");
                        groupIds.push(actualGroupId);
                    } else {
                        realIds.push(id);
                    }
                }

                // Roll initiative for groups using GroupManager
                for (const groupId of groupIds) {
                    log(`[${MODULE_ID}] Rolling initiative for group ${groupId}`);
                    await GroupManager.rollGroupAndApplyInitiative(this, groupId, { mode: "normal" });
                }

                // Roll initiative for real combatants normally
                if (realIds.length > 0) {
                    return originalRollInitiative.call(this, realIds, options);
                }
            };
            log(`[${MODULE_ID}] ✅ Combat.rollInitiative wrapped for group support (fallback without libWrapper)`);
        }
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

        // Ensure group membership reflects the current combatants array.
        // If a stored group exists but had no members in the map (e.g., created after load),
        // populate its members from the live combatants' flags so we can hide them.
        for (const [groupId, groupData] of groups.entries()) {
            if ((groupData.members?.length ?? 0) === 0) {
                const membersFromFlags = combatants.filter(c => (c.getFlag && c.getFlag(MODULE_ID, "groupId") === groupId));
                if (membersFromFlags.length) {
                    groupData.members = membersFromFlags.slice();
                }
            }
        }
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
                (groupData.members || []).forEach(m => groupedMemberIds.add(m.id));
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
    // Compute average HP/max across members (best-effort across systems)
    const hpCandidates = [];
    console.log(`[${MODULE_ID}] Group ${groupId} has ${groupData.members.length} members, searching for HP...`);
    for (const m of groupData.members) {
        // Try common actor system paths for current and max HP
        const cur = foundry.utils.getProperty(m, "actor.system.attributes.hp.value") ?? foundry.utils.getProperty(m, "actor.system.hp.value") ?? foundry.utils.getProperty(m, "actor.system.health.value");
        const max = foundry.utils.getProperty(m, "actor.system.attributes.hp.max") ?? foundry.utils.getProperty(m, "actor.system.hp.max") ?? foundry.utils.getProperty(m, "actor.system.health.max");
        console.log(`[${MODULE_ID}]   ${m.name}: cur=${cur}, max=${max}, actor=${m.actor?.name}`);
        if (Number.isFinite(cur) && Number.isFinite(max) && max > 0) hpCandidates.push({ cur: Number(cur), max: Number(max) });
    }

    let avgCur = null;
    let avgMax = null;
    if (hpCandidates.length) {
        avgCur = hpCandidates.reduce((s, v) => s + v.cur, 0);
        avgMax = hpCandidates.reduce((s, v) => s + v.max, 0);
        console.log(`[${MODULE_ID}]   Total HP: ${avgCur}/${avgMax}`);
    } else {
        console.log(`[${MODULE_ID}]   No HP data found for group members`);
    }

    const proxy = {
        id: `group-${groupId}`,
        _id: `group-${groupId}`,
        name: groupName,
        initiative: groupInitiative,
        actor: {
            system: { attributes: { hp: { value: avgCur ?? null, max: avgMax ?? null } } },
            temporaryEffects: [],
            permission: -10,
            hasPlayerOwner: false,
            testUserPermission: (user, level) => false,
        },
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
        // Mark defeated only if all members are defeated
        get isDefeated() {
            return groupData.members.length > 0 && groupData.members.every(m => m.isDefeated);
        },
        // Mock sort value
        sort: groupData.members.length > 0 
            ? Math.min(...groupData.members.map(c => c.sort ?? 0))
            : 0,
    };

    return proxy;
}
