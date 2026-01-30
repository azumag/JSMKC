/**
 * Validation Middleware for API Routes
 *
 * Provides middleware functions that wrap API route handlers with
 * Zod schema validation. This eliminates repetitive validation
 * boilerplate from individual route handlers.
 *
 * Three middleware patterns are provided:
 * - withValidation: Validates the full request body against a schema
 * - withJsonValidation: Validates a pre-parsed JSON object
 * - withQueryValidation: Validates URL query parameters
 *
 * Error handling:
 * - Zod validation errors are caught and returned as 400 Bad Request
 *   responses with detailed field-level error messages
 * - The error messages are user-friendly and list which fields failed
 *   and why, helping API consumers fix their requests
 *
 * Usage:
 *   import { withValidation } from '@/lib/validation/middleware';
 *   import { createPlayerSchema } from '@/lib/validation/schemas';
 *
 *   export const POST = withValidation(createPlayerSchema, async (req, data) => {
 *     // data is fully validated and typed as CreatePlayerInput
 *     const player = await prisma.player.create({ data });
 *     return NextResponse.json({ success: true, data: player });
 *   });
 */

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Custom Validation Error
// ============================================================

/**
 * Custom error class for validation failures.
 *
 * Extends the standard Error class with additional properties
 * for field-level error details, making it easy to identify
 * exactly which input field(s) failed validation.
 *
 * This error is thrown internally by the middleware and caught
 * to generate appropriate 400 responses. It should not be thrown
 * by application code directly.
 */
export class ValidationError extends Error {
  /** Array of field-level error details from Zod */
  public readonly errors: z.ZodIssue[];

  /**
   * @param message - Human-readable summary of validation failure
   * @param errors - Zod issue array with field-level details
   */
  constructor(message: string, errors: z.ZodIssue[]) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;

    // Ensure correct prototype chain for instanceof checks.
    // Required when extending built-in classes in TypeScript.
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// ============================================================
// Request Body Validation Middleware
// ============================================================

/**
 * Middleware that validates the request body against a Zod schema
 * before calling the handler.
 *
 * The handler receives the original request and the validated data,
 * which is fully typed according to the schema. If validation fails,
 * a 400 error response is returned automatically without calling
 * the handler.
 *
 * This middleware:
 * 1. Parses the request body as JSON
 * 2. Validates the JSON against the provided Zod schema
 * 3. If valid, calls the handler with the typed data
 * 4. If invalid, returns a 400 response with field-level errors
 *
 * @template T - The Zod schema type (inferred from the schema parameter)
 * @param schema - The Zod schema to validate against
 * @param handler - The route handler to call with validated data
 * @returns A new route handler function that validates before executing
 *
 * @example
 *   // In an API route file:
 *   import { withValidation } from '@/lib/validation/middleware';
 *   import { createPlayerSchema } from '@/lib/validation/schemas';
 *
 *   export const POST = withValidation(
 *     createPlayerSchema,
 *     async (request, validatedData) => {
 *       // validatedData is typed as CreatePlayerInput
 *       const player = await prisma.player.create({
 *         data: validatedData,
 *       });
 *       return NextResponse.json({ success: true, data: player });
 *     }
 *   );
 */
export function withValidation<T extends z.ZodType>(
  schema: T,
  handler: (
    request: NextRequest,
    data: z.infer<T>
  ) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Step 1: Parse the request body as JSON.
      // If the body is not valid JSON, this will throw a SyntaxError.
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        // JSON parsing failed - return a clear error message
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid JSON in request body',
            code: 'INVALID_JSON',
          },
          { status: 400 }
        );
      }

      // Step 2: Validate the parsed body against the Zod schema.
      // safeParse returns a discriminated union: success | error.
      const result = schema.safeParse(body);

      if (!result.success) {
        // Validation failed - extract field-level errors for the response.
        // Format each Zod issue as "fieldPath: message" for clarity.
        const fieldErrors = result.error.issues.map((issue: z.ZodIssue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        });

        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: fieldErrors,
          },
          { status: 400 }
        );
      }

      // Step 3: Validation passed - call the handler with typed data.
      // result.data is fully typed as z.infer<T>.
      return await handler(request, result.data);
    } catch (error) {
      // Handle unexpected errors (not validation-related).
      // This catch block handles errors thrown by the handler itself.
      if (error instanceof ValidationError) {
        // ValidationError from application code (not Zod)
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            code: 'VALIDATION_ERROR',
            details: error.errors.map((e) => {
              const path = e.path.join('.');
              return path ? `${path}: ${e.message}` : e.message;
            }),
          },
          { status: 400 }
        );
      }

      // Re-throw non-validation errors to be handled by the
      // outer error handling middleware or Next.js error boundary
      throw error;
    }
  };
}

// ============================================================
// JSON Object Validation
// ============================================================

/**
 * Validates a pre-parsed JSON object against a Zod schema.
 *
 * Unlike withValidation which handles the full request lifecycle,
 * this function validates an already-parsed object and returns
 * the typed result or a NextResponse error.
 *
 * Useful when:
 * - The request body has already been parsed
 * - Validating nested objects within a larger request
 * - Validating data from sources other than the request body
 *
 * @template T - The Zod schema type
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate (already parsed from JSON)
 * @returns Either the validated data (typed) or a NextResponse error
 *
 * @example
 *   const body = await request.json();
 *   const result = withJsonValidation(createPlayerSchema, body);
 *   if (result instanceof NextResponse) return result; // Validation error
 *   // result is typed as CreatePlayerInput
 *   const player = await prisma.player.create({ data: result });
 */
export function withJsonValidation<T extends z.ZodType>(
  schema: T,
  data: unknown
): z.infer<T> | NextResponse {
  // Use safeParse for non-throwing validation
  const result = schema.safeParse(data);

  if (!result.success) {
    // Format field-level errors for the response.
    // Each error includes the field path and the validation message.
    const fieldErrors = result.error.issues.map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });

    // Return a NextResponse error that the caller can return directly
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: fieldErrors,
      },
      { status: 400 }
    );
  }

  // Return the validated and typed data
  return result.data;
}

// ============================================================
// Query Parameter Validation
// ============================================================

/**
 * Validates URL query parameters against a Zod schema.
 *
 * Converts URLSearchParams to a plain object and validates it.
 * This is used for GET requests where parameters come from the
 * URL query string rather than the request body.
 *
 * Note: All query parameter values are strings, so schemas should
 * use z.coerce for numeric fields (e.g., z.coerce.number()).
 *
 * @template T - The Zod schema type
 * @param schema - The Zod schema to validate against
 * @param params - URL search params (from request.nextUrl.searchParams)
 * @returns Either the validated data (typed) or a NextResponse error
 *
 * @example
 *   export async function GET(request: NextRequest) {
 *     const result = withQueryValidation(
 *       paginationSchema,
 *       request.nextUrl.searchParams
 *     );
 *     if (result instanceof NextResponse) return result;
 *     // result is typed as PaginationInput
 *     const { page, limit } = result;
 *   }
 */
export function withQueryValidation<T extends z.ZodType>(
  schema: T,
  params: URLSearchParams
): z.infer<T> | NextResponse {
  // Convert URLSearchParams to a plain object for Zod validation.
  // URLSearchParams is an iterable of [key, value] pairs, which
  // Object.fromEntries converts to { key: value, ... }.
  //
  // Note: This only captures the last value for duplicate keys.
  // For multi-value params, a different approach would be needed.
  const paramObject: Record<string, string> = {};
  params.forEach((value, key) => {
    paramObject[key] = value;
  });

  // Validate the params object against the schema.
  // Schemas should use z.coerce for type conversion since all
  // query param values are strings.
  const result = schema.safeParse(paramObject);

  if (!result.success) {
    // Format query parameter validation errors.
    // Include the parameter name in each error for clarity.
    const fieldErrors = result.error.issues.map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path
        ? `Query parameter '${path}': ${issue.message}`
        : issue.message;
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: fieldErrors,
      },
      { status: 400 }
    );
  }

  return result.data;
}
