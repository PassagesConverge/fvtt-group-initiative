/****************************************************************************************
 * carousel-integration.js — Integration with Combat Tracker Dock (Carousel)
 * --------------------------------------------------------------------------------------
 * This module intercepts the Carousel's sortedCombatants getter to show groups
 * as individual combatants while hiding group members.
 ****************************************************************************************/

import { MODULE_ID, log } from "./shared.js";
import { GroupManager } from "./class-objects.js";

/**
 * Calculate progress for a group in carousel
 * Returns { completed: number, total: number, percentage: number }
 */
function calculateCarouselGroupProgress(combat, groupId, groupMembers) {
    if (!combat || !groupMembers || groupMembers.length === 0) {
        return { completed: 0, total: 0, percentage: 0 };
    }

    const currentTurn = combat.turn ?? 0;
    const total = groupMembers.length;
    
    // Count how many have had their turn this round
    let completed = 0;
    for (const member of groupMembers) {
        const memberIndex = combat.turns.findIndex(t => t.id === member.id);
        if (memberIndex === -1) continue;
        
        // If we're past this combatant's turn in the current round, they've gone
        if (memberIndex < currentTurn) {
            completed++;
        }
    }
    
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    return { completed, total, percentage };
}

/**
 * Initialize carousel integration
 * Wraps the CombatDock's sortedCombatants getter to filter combatants
 */
export function initCarouselIntegration() {
    // Helper that performs the actual wrapping for a given CombatDock class
    function wrapCombatDockClass(CombatDockClass) {
        try {
            if (!CombatDockClass || CombatDockClass.prototype.__squadSCIWrapped) return false;
            
            // Wrap sortedCombatants getter
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
            
            // Wrap CombatantPortrait.renderInner to handle group portrait active state
            const CombatantPortraitClass = CONFIG.combatTrackerDock?.CombatantPortrait;
            if (CombatantPortraitClass && !CombatantPortraitClass.prototype.__squadSCIRenderWrapped) {
                const original_renderInner = CombatantPortraitClass.prototype.renderInner;
                CombatantPortraitClass.prototype.renderInner = async function() {
                    await original_renderInner.call(this);
                    
                    // After rendering, check if this is a group portrait and if any member is current
                    const combatant = this.combatant;
                    if (combatant?.id?.startsWith('group-')) {
                        const groupId = combatant.flags?.[MODULE_ID]?.groupId;
                        const currentCombatant = this.combat?.combatant;
                        
                        if (groupId && currentCombatant) {
                            const currentGroupId = currentCombatant.getFlag(MODULE_ID, "groupId");
                            if (currentGroupId === groupId) {
                                this.element.classList.add("active");
                            } else {
                                this.element.classList.remove("active");
                            }
                        }
                    }
                };
                CombatantPortraitClass.prototype.__squadSCIRenderWrapped = true;
            }
            
            // Wrap updateOrder to handle group positioning correctly
            const original_updateOrder = CombatDockClass.prototype.updateOrder;
            if (original_updateOrder) {
                CombatDockClass.prototype.updateOrder = function() {
                    this.setupSeparator();
                    const separator = this.element.querySelector(".separator");
                    const isTrueCarousel = this.trueCarousel;
                    separator.style.display = isTrueCarousel ? "" : "none";
                    if (this.sortedCombatants.filter((c) => c?.visible)?.length === 0) {
                        separator.style.display = "none";
                    }
                    separator.classList.remove("vertical", "horizontal");
                    separator.classList.add(this.isVertical ? "vertical" : "horizontal");

                    const combatants = this.sortedCombatants;

                    // Determine which combatant to center on
                    let currentCombatant = this.combat.combatant;
                    
                    // If current combatant is in a group, use the group proxy instead
                    if (currentCombatant) {
                        const groupId = currentCombatant.getFlag(MODULE_ID, "groupId");
                        if (groupId) {
                            const groupProxy = combatants.find(c => c.id === `group-${groupId}`);
                            if (groupProxy) {
                                currentCombatant = groupProxy;
                            }
                        }
                    }

                    if (!this.trueCarousel) {
                        // Non-carousel mode: order by initiative
                        // Use ID-based lookup instead of reference equality since proxies are regenerated
                        this.portraits.forEach((p) => {
                            const index = combatants.findIndex(c => c.id === p.combatant.id);
                            p.element.style.setProperty("order", index >= 0 ? index : 999);
                        });
                        return;
                    }

                    const isLeftAligned = this.leftAligned;

                    //order combatants so that the current combatant is at the center
                    // Use ID-based comparison since proxies are regenerated
                    const currentCombatantIndex = combatants.findIndex((c) => c.id === currentCombatant?.id) + combatants.length;
                    const tempCombatantList = [...combatants, ...combatants, ...combatants];
                    const halfLength = isLeftAligned ? combatants.length : Math.floor(combatants.length / 2);
                    const orderedCombatants = tempCombatantList.slice(currentCombatantIndex - halfLength, currentCombatantIndex + halfLength + 1);

                    const lastCombatant = this.sortedCombatants[this.sortedCombatants.length - 1];

                    // Use ID-based lookup instead of reference equality since proxies are regenerated
                    this.portraits.forEach((p) => {
                        const combatant = orderedCombatants.find((c) => c.id === p.combatant.id);
                        const index = orderedCombatants.findIndex((c) => c.id === combatant?.id);
                        p.element.style.setProperty("order", index >= 0 ? index * 100 : 999999);
                    });

                    //get last combatant's order
                    const lastCombatantOrder = this.portraits.find((p) => p.combatant.id === lastCombatant?.id)?.element?.style?.order ?? 999999;
                    //set separator's order to last combatant's order + 1

                    separator.style.setProperty("order", parseInt(lastCombatantOrder) + 1);
                };
            }
            
            // Wrap _onCombatTurn to prevent animations when cycling within groups
            const original_onCombatTurn = CombatDockClass.prototype._onCombatTurn;
            if (original_onCombatTurn) {
                CombatDockClass.prototype._onCombatTurn = function(combat, updates, update) {
                    // Check if we're cycling within a group
                    const currentCombatant = combat.combatant;
                    if (currentCombatant && ("turn" in updates || "round" in updates)) {
                        const groupId = currentCombatant.getFlag(MODULE_ID, "groupId");
                        
                        if (groupId) {
                            const groups = GroupManager.getGroups(combat.turns, combat);
                            const groupData = groups.get(groupId);
                            
                            if (groupData && groupData.members && groupData.members.length > 0) {
                                const firstMember = groupData.members[0];
                                const isCyclingWithinGroup = firstMember && currentCombatant.id !== firstMember.id;
                                
                                if (isCyclingWithinGroup) {
                                    // Cycling within group - update positioning but skip animations
                                    updateCarouselProgressBars();
                                    updateGroupPortraitActiveState.call(this, combat, groupId);
                                    
                                    // Update order to maintain carousel positioning without animations
                                    this.updateOrder();
                                    this.centerCurrentCombatant();
                                    
                                    return;
                                }
                            }
                        }
                    }
                    
                    // Normal turn change - call original method
                    const result = original_onCombatTurn.call(this, combat, updates, update);
                    
                    // After normal turn change, check if we just entered a group and ensure its portrait is active
                    if (combat.combatant) {
                        const groupId = combat.combatant.getFlag(MODULE_ID, "groupId");
                        if (groupId) {
                            updateGroupPortraitActiveState.call(this, combat, groupId);
                        }
                    }
                    
                    return result;
                };
            }
            
            // Wrap setupCombatants to ensure active state is updated after all portraits are created
            const original_setupCombatants = CombatDockClass.prototype.setupCombatants;
            if (original_setupCombatants) {
                CombatDockClass.prototype.setupCombatants = function() {
                    const result = original_setupCombatants.call(this);
                    
                    // After portraits render, ensure group portrait has active state
                    setTimeout(() => {
                        const currentCombatant = this.combat?.combatant;
                        if (currentCombatant) {
                            const groupId = currentCombatant.getFlag(MODULE_ID, "groupId");
                            if (groupId) {
                                updateGroupPortraitActiveState.call(this, this.combat, groupId);
                            }
                        }
                    }, 50);
                    
                    return result;
                };
            }
            
            // Helper function to update group portrait active state
            function updateGroupPortraitActiveState(combat, groupId) {
                if (!this.element) return;
                
                // Remove active from all portraits
                const allPortraits = this.element.querySelectorAll(".combatant-portrait");
                allPortraits?.forEach(p => p.classList.remove("active"));
                
                // Add active to the group portrait
                const groupPortrait = this.element.querySelector(`[data-combatant-id="group-${groupId}"]`);
                if (groupPortrait) {
                    groupPortrait.classList.add("active");
                }
            }
            
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

        // Sort result by initiative (highest first) to maintain proper combat order
        result.sort((a, b) => {
            const initA = a.initiative ?? -Infinity;
            const initB = b.initiative ?? -Infinity;
            if (initA !== initB) return initB - initA; // Higher initiative first
            
            // Tie-breaker: use ID for consistent ordering
            return a.id > b.id ? 1 : -1;
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
    const groupColor = groupCfg.color || "#8b5cf6";
    console.log(`[${MODULE_ID}] Creating group proxy for ${groupId} with image:`, groupImg);
    
    // Calculate progress for this group
    const progress = calculateCarouselGroupProgress(combat, groupId, groupData.members);
    
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
                progress: progress,
                groupColor: groupColor,
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

/**
 * Inject progress bars into carousel combatant elements
 */
function injectCarouselProgressBars() {
    try {
        const combat = game.combat;
        if (!combat) return;

        // Find the carousel container
        const carouselContainer = document.querySelector("#combat-carousel, .combat-carousel, .combat-dock");
        if (!carouselContainer) return;

        // Find all combatant elements in the carousel
        const combatantElements = carouselContainer.querySelectorAll("[data-combatant-id]");
        
        for (const element of combatantElements) {
            const combatantId = element.dataset.combatantId;
            
            // Check if this is a group proxy
            if (!combatantId || !combatantId.startsWith("group-")) continue;
            
            // Skip if progress bar already exists
            if (element.querySelector(".carousel-group-progress-bar")) continue;
            
            // Get the group proxy from carousel
            const groupId = combatantId.replace("group-", "");
            const groups = GroupManager.getGroups(combat.turns, combat);
            const groupData = groups.get(groupId);
            
            if (!groupData) continue;
            
            const flagGroups = foundry.utils.getProperty(combat, `flags.${MODULE_ID}.groups`) || {};
            const groupCfg = flagGroups[groupId] || {};
            const groupColor = groupCfg.color || "#8b5cf6";
            
            // Calculate progress
            const progress = calculateCarouselGroupProgress(combat, groupId, groupData.members || []);
            
            // Create progress bar HTML
            const progressBar = document.createElement("div");
            progressBar.classList.add("carousel-group-progress-bar");
            progressBar.dataset.groupId = groupId;
            progressBar.style.setProperty("--carousel-group-color", groupColor);
            progressBar.innerHTML = `
                <div class="carousel-progress-fill" style="width: ${progress.percentage}%" data-completed="${progress.completed}" data-total="${progress.total}"></div>
            `;
            
            // Find the combatant-wrapper child and insert the progress bar there
            const wrapper = element.querySelector(".combatant-wrapper");
            if (wrapper) {
                wrapper.style.position = "relative";
                wrapper.style.overflow = "hidden";
                wrapper.appendChild(progressBar);
            } else {
                // Fallback: insert into the element itself
                element.style.position = "relative";
                element.insertBefore(progressBar, element.firstChild);
            }
        }
    } catch (err) {
        console.error(`[${MODULE_ID}] Error injecting carousel progress bars:`, err);
    }
}

/**
 * Update progress bars in carousel
 */
function updateCarouselProgressBars() {
    try {
        const combat = game.combat;
        if (!combat) return;

        // Find all carousel progress bars
        const progressBars = document.querySelectorAll(".carousel-group-progress-bar");
        
        for (const progressBar of progressBars) {
            const groupId = progressBar.dataset.groupId;
            if (!groupId) continue;
            
            const groups = GroupManager.getGroups(combat.turns, combat);
            const groupData = groups.get(groupId);
            
            if (!groupData) continue;
            
            // Calculate and update progress
            const progress = calculateCarouselGroupProgress(combat, groupId, groupData.members || []);
            const progressFill = progressBar.querySelector(".carousel-progress-fill");
            
            if (progressFill) {
                progressFill.style.width = `${progress.percentage}%`;
            }
        }
    } catch (err) {
        console.error(`[${MODULE_ID}] Error updating carousel progress bars:`, err);
    }
}

/**
 * Initialize carousel progress bar hooks
 */
function initCarouselProgressBars() {
    // Hook into combat dock rendering
    Hooks.on("renderCombatDock", () => {
        // Delay slightly to ensure DOM is ready
        setTimeout(() => {
            injectCarouselProgressBars();
        }, 100);
    });

    // Also try generic hooks
    Hooks.on("renderApplication", (app) => {
        if (app.constructor.name === "CombatDock" || app.id === "combat-carousel") {
            setTimeout(() => {
                injectCarouselProgressBars();
            }, 100);
        }
    });

    // Update progress when combat changes
    Hooks.on("updateCombat", (combat, update) => {
        if ("turn" in update || "round" in update) {
            updateCarouselProgressBars();
        }
    });

    // Update when combatants change groups
    Hooks.on("updateCombatant", (combatant, changes) => {
        const flagsChanged = foundry.utils.getProperty(changes, `flags.${MODULE_ID}`) !== undefined;
        if (flagsChanged) {
            setTimeout(() => {
                injectCarouselProgressBars();
            }, 100);
        }
    });

    // Use MutationObserver to detect when carousel adds new elements
    const observeCarousel = () => {
        const carouselContainer = document.querySelector("#combat-carousel, .combat-carousel, .combat-dock");
        if (!carouselContainer) {
            // Try again later if carousel isn't ready yet
            setTimeout(observeCarousel, 1000);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                // Only update when nodes are added (carousel rendering), not on attribute changes
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                injectCarouselProgressBars();
            }
        });

        observer.observe(carouselContainer, {
            childList: true,
            subtree: true
        });

        log(`[${MODULE_ID}] Carousel MutationObserver initialized`);
    };

    // Start observing once DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeCarousel);
    } else {
        observeCarousel();
    }
}

// Initialize carousel progress bars when the module initializes
Hooks.once("ready", () => {
    if (game.modules.get("combat-tracker-dock")?.active) {
        initCarouselProgressBars();
        log(`[${MODULE_ID}] Carousel progress bars initialized`);
    }
});
