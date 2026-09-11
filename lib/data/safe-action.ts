import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { auth } from "../auth";

export class ActionError extends Error {}

/**
 * Creates a client of next-safe-action to use in server actions
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof ActionError) {
      return e.message;
    }

    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

/**
 * Creates an authenticated action
 *
 * Passes the userId to the next function
 *
 * @returns {Promise<void>} A promise that resolves when the action is executed.
 * @throws {Error} If the user is not authenticated or the user ID is not available.
 */
export const authenticatedAction = actionClient.use(async ({ next }) => {
  const session = await auth();
  const userId = session?.user.id;

  if (!session || !userId) {
    throw new Error("Not authenticated");
  }

  return next({ ctx: { userId } });
});

/**
 * Parses the action error object and returns a formatted error message.
 *
 * @param error - The action error object.
 * @returns The formatted error message.
 */
export const parseActionError = (error: {
  serverError?: string;
  validationErrors?: {
    _errors?: string[];
    id?: {
      _errors?: string[];
    };
  };
  bindArgsValidationErrors?: readonly [];
  fetchError?: string;
}): string => {
  let errorMessage = "";

  if (error.serverError) {
    errorMessage += `Server Error: ${error.serverError}\n`;
  }

  if (error.validationErrors) {
    if (
      error.validationErrors._errors &&
      error.validationErrors._errors.length > 0
    ) {
      errorMessage += `Validation Errors: ${error.validationErrors._errors.join(
        ", "
      )}\n`;
    }

    if (
      error.validationErrors.id?._errors &&
      error.validationErrors.id._errors.length > 0
    ) {
      errorMessage += `Validation Errors for ID: ${error.validationErrors.id._errors.join(
        ", "
      )}\n`;
    }
  }

  if (
    error.bindArgsValidationErrors &&
    error.bindArgsValidationErrors.length > 0
  ) {
    errorMessage += `Bind Args Validation Errors: ${error.bindArgsValidationErrors.join(
      ", "
    )}\n`;
  }

  if (error.fetchError) {
    errorMessage += `Fetch Error: ${error.fetchError}\n`;
  }

  return errorMessage.trim();
};
