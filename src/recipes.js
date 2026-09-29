import { openBrowserSession, interactBrowserSession, captureBrowserSession, closeBrowserSession } from "./session.js";

const RECIPES = Object.freeze({
  "field.canvas-first-paint": { description: "Capture a real project after first stable paint.", steps: [{ action: "wait", waitMs: 1200 }] },
  "field.full": { description: "Switch workspace layout to Full.", steps: [{ action: "click", locator: { type: "text", value: "Full" } }, { action: "wait", waitMs: 350 }] },
  "field.focus": { description: "Switch workspace layout to Focus.", steps: [{ action: "click", locator: { type: "text", value: "Focus" } }, { action: "wait", waitMs: 350 }] },
  "field.float": { description: "Switch workspace layout to Float.", steps: [{ action: "click", locator: { type: "text", value: "Float" } }, { action: "wait", waitMs: 350 }] },
  "field.light": { description: "Switch field chrome to Light.", steps: [{ action: "click", locator: { type: "text", value: "Light" } }, { action: "wait", waitMs: 250 }] },
  "field.dark": { description: "Switch field chrome to Dark.", steps: [{ action: "click", locator: { type: "text", value: "Dark" } }, { action: "wait", waitMs: 250 }] },
  "field.inspector-stroke": { description: "Open the visible Stroke control for the current QA selection.", steps: [{ action: "click", locator: { type: "text", value: "Stroke" } }, { action: "wait", waitMs: 250 }] }
});

function assertRealProjectRoute(url) {
  if (!/^\/qa\/work\/[^/]+/.test(url.pathname)) throw new Error("Field QA recipes require /qa/work/{projectId}");
}

export function listBrowserRecipes() {
  return Object.entries(RECIPES).map(([id, recipe]) => ({ id, description: recipe.description, real_project: true, step_count: recipe.steps.length }));
}

export async function runBrowserRecipe(binding, bucket, { recipe: recipeId, url, accessJwt, requestId, context }) {
  const recipe = RECIPES[recipeId];
  if (!recipe) throw new Error("Unknown browser recipe");
  assertRealProjectRoute(url);
  let opened;
  try {
    opened = await openBrowserSession(binding, bucket, {
      url, accessJwt,
      context: { ...(context || {}), project: context?.project || "field", route_kind: "qa-work", surface: context?.surface || "editor" }
    });
    for (const step of recipe.steps) {
      await interactBrowserSession(binding, bucket, { sessionId: opened.session_id, targetId: opened.target_id, accessJwt, ...step });
    }
    const evidence = await captureBrowserSession(binding, bucket, {
      sessionId: opened.session_id, targetId: opened.target_id, accessJwt, requestId,
      context: { ...(context || {}), project: context?.project || "field", route_kind: "qa-work", surface: context?.surface || "editor" }
    });
    return { ...evidence, recipe: recipeId };
  } finally {
    if (opened?.session_id) { try { await closeBrowserSession(binding, bucket, opened.session_id); } catch {} }
  }
}