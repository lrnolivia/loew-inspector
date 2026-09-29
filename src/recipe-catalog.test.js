import test from "node:test";
import assert from "node:assert/strict";
import { getBuiltInRecipe, listBuiltInRecipes, RECIPE_SCHEMA_VERSION } from "./recipe-catalog.js";

test("versioned recipe catalog owns verified deterministic field recipes", () => {
  const stage0 = getBuiltInRecipe("field.stage0");
  assert.equal(stage0.schema_version, RECIPE_SCHEMA_VERSION);
  assert.equal(stage0.recipe_version, 1);
  assert.deepEqual(stage0.steps.map(step => step.id), ["canvas-first-paint","full","focus","float"]);
  const media = getBuiltInRecipe("field.media-toolbar");
  assert.deepEqual(media.steps.map(step => step.id), ["canvas-first-paint","media-open","media-close","insert-open"]);
  assert.equal(media.steps[1].interaction.locator.value, '[data-toolbar-tool="media"]');
  assert.equal(media.steps[3].interaction.locator.value, '[data-left-menu-item="insert"]');
  assert.equal(listBuiltInRecipes().every(recipe => recipe.verified), true);
});
