/****************************************************************************************
 * multi-token-effects.js — Apply status effects to all selected tokens
 * --------------------------------------------------------------------------------------
 * When toggling a status effect on one selected token, apply the same change
 * to all other selected tokens on the canvas.
 ****************************************************************************************/

import { log } from "./shared.js";

const MODULE_ID = "squad-combat-initiative";
let isSyncing = false; // Flag to prevent cascading hook calls

/**
 * Initialize multi-token effect synchronization
 */
export function initMultiTokenEffects() {
    console.log(`[${MODULE_ID}] initMultiTokenEffects called`);
    
    // Listen for active effect changes on actors with separate handlers for each event type
    Hooks.on("createActiveEffect", (effect, options, userId) => onEffectCreate(effect, options, userId));
    Hooks.on("deleteActiveEffect", (effect, options, userId) => onEffectDelete(effect, options, userId));
    
    console.log(`[${MODULE_ID}] ✅ Multi-token effects hooks registered`);
    log(`[${MODULE_ID}] ✅ Multi-token effects initialized`);
    return true;
}

/**
 * Handle active effect creation - sync effect ON to other selected tokens
 */
async function onEffectCreate(effect, options, userId) {
    try {
        // Ignore if we're already syncing (prevents cascade)
        if (isSyncing) {
            return;
        }
        
        // Ignore if this is a remote user's action
        if (userId !== game.userId) {
            return;
        }
        
        // Get the actor and token
        const actor = effect.parent;
        if (!actor?.isToken) return;
        
        const token = actor.token?.object;
        if (!token) return;
        
        // Get the status ID from the effect
        const statusId = effect.statuses?.first();
        if (!statusId) {
            return;
        }
        
        // Get all selected tokens (excluding this one)
        const selectedTokens = canvas.tokens.controlled?.filter(t => t.id !== token.id) ?? [];
        if (selectedTokens.length === 0) {
            return;
        }
        
        console.log(`[${MODULE_ID}] Effect created: "${statusId}" on ${token.name}`);
        console.log(`[${MODULE_ID}] Syncing status "${statusId}" ON to ${selectedTokens.length} other selected token(s)`);
        
        // Set syncing flag to prevent cascade
        isSyncing = true;
        
        try {
            // Sync to all other selected tokens (turn effect ON)
            for (const targetToken of selectedTokens) {
                if (!targetToken.actor) continue;
                
                try {
                    // Check if target already has this effect
                    const targetHasEffect = targetToken.actor.effects?.some(e => e.statuses?.has(statusId)) ?? false;
                    
                    if (targetHasEffect) {
                        console.log(`[${MODULE_ID}]   ${targetToken.name}: already has ${statusId}`);
                        continue;
                    }
                    
                    console.log(`[${MODULE_ID}]   Enabling ${statusId} on ${targetToken.name}`);
                    await targetToken.actor.toggleStatusEffect(statusId, { active: true });
                } catch (err) {
                    // Silently ignore "already exists" errors - effect is already present
                    if (err.message?.includes("already exists")) {
                        console.log(`[${MODULE_ID}]   ${targetToken.name}: effect already present`);
                    } else {
                        console.warn(`[${MODULE_ID}] Failed to sync effect to ${targetToken.name}:`, err.message);
                    }
                }
            }
        } finally {
            // Always clear the syncing flag
            isSyncing = false;
        }
    } catch (err) {
        console.error(`[${MODULE_ID}] Error in createActiveEffect handler:`, err);
    }
}

/**
 * Handle active effect deletion - sync effect OFF to other selected tokens
 */
async function onEffectDelete(effect, options, userId) {
    try {
        // Ignore if we're already syncing (prevents cascade)
        if (isSyncing) {
            return;
        }
        
        // Ignore if this is a remote user's action
        if (userId !== game.userId) {
            return;
        }
        
        // Get the actor and token
        const actor = effect.parent;
        if (!actor?.isToken) return;
        
        const token = actor.token?.object;
        if (!token) return;
        
        // Get the status ID from the effect
        const statusId = effect.statuses?.first();
        if (!statusId) {
            return;
        }
        
        // Get all selected tokens (excluding this one)
        const selectedTokens = canvas.tokens.controlled?.filter(t => t.id !== token.id) ?? [];
        if (selectedTokens.length === 0) {
            return;
        }
        
        console.log(`[${MODULE_ID}] Effect deleted: "${statusId}" from ${token.name}`);
        console.log(`[${MODULE_ID}] Syncing status "${statusId}" OFF to ${selectedTokens.length} other selected token(s)`);
        
        // Set syncing flag to prevent cascade
        isSyncing = true;
        
        try {
            // Sync to all other selected tokens (turn effect OFF)
            for (const targetToken of selectedTokens) {
                if (!targetToken.actor) continue;
                
                try {
                    // Find all effects with this status on the target
                    const effectsToDelete = targetToken.actor.effects?.filter(e => e.statuses?.has(statusId)) ?? [];
                    
                    if (effectsToDelete.length === 0) {
                        console.log(`[${MODULE_ID}]   ${targetToken.name}: already doesn't have ${statusId}`);
                        continue;
                    }
                    
                    console.log(`[${MODULE_ID}]   Disabling ${statusId} on ${targetToken.name} (found ${effectsToDelete.length} effect(s) to remove)`);
                    
                    // Delete each effect individually to handle errors gracefully
                    for (const effectToDelete of effectsToDelete) {
                        try {
                            // Double-check the effect still exists before attempting deletion
                            const stillExists = targetToken.actor.effects?.some(ef => ef.id === effectToDelete.id);
                            if (!stillExists) {
                                console.log(`[${MODULE_ID}]     Effect ${effectToDelete.id} already removed`);
                                continue;
                            }
                            
                            await targetToken.actor.deleteEmbeddedDocuments("ActiveEffect", [effectToDelete.id]);
                            console.log(`[${MODULE_ID}]     ✓ Removed effect ${effectToDelete.id}`);
                        } catch (deleteErr) {
                            // Silently ignore "does not exist" errors - effect was already removed
                            if (!deleteErr.message?.includes("does not exist")) {
                                console.warn(`[${MODULE_ID}]     Failed to delete effect ${effectToDelete.id}:`, deleteErr.message);
                            }
                        }
                    }
                } catch (err) {
                    // Catch any other unexpected errors
                    console.warn(`[${MODULE_ID}] Failed to sync effect to ${targetToken.name}:`, err.message);
                }
            }
        } finally {
            // Always clear the syncing flag
            isSyncing = false;
        }
    } catch (err) {
        console.error(`[${MODULE_ID}] Error in deleteActiveEffect handler:`, err);
    }
}
