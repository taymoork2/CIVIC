/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as actions from "../actions.js";
import type * as auth from "../auth.js";
import type * as authLimits from "../authLimits.js";
import type * as authOrigin from "../authOrigin.js";
import type * as careInstructions from "../careInstructions.js";
import type * as catalog from "../catalog.js";
import type * as catalogDirectionAdapter from "../catalogDirectionAdapter.js";
import type * as catalogIdentity from "../catalogIdentity.js";
import type * as catalogValues from "../catalogValues.js";
import type * as closet from "../closet.js";
import type * as costs from "../costs.js";
import type * as dryerContext from "../dryerContext.js";
import type * as dryerContextValues from "../dryerContextValues.js";
import type * as dryingQueue from "../dryingQueue.js";
import type * as errors from "../errors.js";
import type * as execution from "../execution.js";
import type * as executionHelpers from "../executionHelpers.js";
import type * as feedback from "../feedback.js";
import type * as fixtures from "../fixtures.js";
import type * as garmentAdvice from "../garmentAdvice.js";
import type * as garmentAdviceValues from "../garmentAdviceValues.js";
import type * as hangRule from "../hangRule.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as intakeSaves from "../intakeSaves.js";
import type * as inventory from "../inventory.js";
import type * as inventoryBrowse from "../inventoryBrowse.js";
import type * as inventoryHelpers from "../inventoryHelpers.js";
import type * as milestones from "../milestones.js";
import type * as notifications from "../notifications.js";
import type * as outcomeAssessments from "../outcomeAssessments.js";
import type * as outcomeValues from "../outcomeValues.js";
import type * as outfits from "../outfits.js";
import type * as personalAdaptation from "../personalAdaptation.js";
import type * as personalOutcomeContext from "../personalOutcomeContext.js";
import type * as personalOutcomeHistory from "../personalOutcomeHistory.js";
import type * as personalPlanStorage from "../personalPlanStorage.js";
import type * as personalRoutineValues from "../personalRoutineValues.js";
import type * as personalRoutines from "../personalRoutines.js";
import type * as personalSuggestions from "../personalSuggestions.js";
import type * as photos from "../photos.js";
import type * as planStorage from "../planStorage.js";
import type * as plans from "../plans.js";
import type * as plansHelpers from "../plansHelpers.js";
import type * as principal from "../principal.js";
import type * as push from "../push.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as pushPolicy from "../pushPolicy.js";
import type * as reminders from "../reminders.js";
import type * as sessionTime from "../sessionTime.js";
import type * as sessions from "../sessions.js";
import type * as testing from "../testing.js";
import type * as validators from "../validators.js";
import type * as waterHardness from "../waterHardness.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  actions: typeof actions;
  auth: typeof auth;
  authLimits: typeof authLimits;
  authOrigin: typeof authOrigin;
  careInstructions: typeof careInstructions;
  catalog: typeof catalog;
  catalogDirectionAdapter: typeof catalogDirectionAdapter;
  catalogIdentity: typeof catalogIdentity;
  catalogValues: typeof catalogValues;
  closet: typeof closet;
  costs: typeof costs;
  dryerContext: typeof dryerContext;
  dryerContextValues: typeof dryerContextValues;
  dryingQueue: typeof dryingQueue;
  errors: typeof errors;
  execution: typeof execution;
  executionHelpers: typeof executionHelpers;
  feedback: typeof feedback;
  fixtures: typeof fixtures;
  garmentAdvice: typeof garmentAdvice;
  garmentAdviceValues: typeof garmentAdviceValues;
  hangRule: typeof hangRule;
  health: typeof health;
  households: typeof households;
  http: typeof http;
  identity: typeof identity;
  intakeSaves: typeof intakeSaves;
  inventory: typeof inventory;
  inventoryBrowse: typeof inventoryBrowse;
  inventoryHelpers: typeof inventoryHelpers;
  milestones: typeof milestones;
  notifications: typeof notifications;
  outcomeAssessments: typeof outcomeAssessments;
  outcomeValues: typeof outcomeValues;
  outfits: typeof outfits;
  personalAdaptation: typeof personalAdaptation;
  personalOutcomeContext: typeof personalOutcomeContext;
  personalOutcomeHistory: typeof personalOutcomeHistory;
  personalPlanStorage: typeof personalPlanStorage;
  personalRoutineValues: typeof personalRoutineValues;
  personalRoutines: typeof personalRoutines;
  personalSuggestions: typeof personalSuggestions;
  photos: typeof photos;
  planStorage: typeof planStorage;
  plans: typeof plans;
  plansHelpers: typeof plansHelpers;
  principal: typeof principal;
  push: typeof push;
  pushDelivery: typeof pushDelivery;
  pushPolicy: typeof pushPolicy;
  reminders: typeof reminders;
  sessionTime: typeof sessionTime;
  sessions: typeof sessions;
  testing: typeof testing;
  validators: typeof validators;
  waterHardness: typeof waterHardness;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
