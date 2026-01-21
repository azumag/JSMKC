import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '../logger';
import { createErrorResponse, handleValidationError } from '../error-handling';

const log = createLogger('validation');

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function withValidation<T>(
  handler: (req: NextRequest, data: T) => Promise<NextResponse>,
  schema: {
    parse: (data: unknown) => T;
  }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      let data: unknown;

      if (req.method === 'GET') {
        // Parse query parameters for GET requests
        const url = new URL(req.url);
        data = Object.fromEntries(url.searchParams);
      } else {
        // Parse body for POST, PUT, PATCH, DELETE requests
        const contentType = req.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          const body = await req.text();
          data = JSON.parse(body);
        } else if (contentType?.includes('multipart/form-data')) {
          // For form data, you might need to use a different approach
          data = await req.formData();
        } else {
          data = await req.text();
        }
      }

      // Validate data against schema
      const validatedData = schema.parse(data);
      
      // Call the original handler with validated data
      return await handler(req, validatedData);
    } catch (error) {
      log.error('Validation error:', error);
      
      if (error instanceof ValidationError) {
        return handleValidationError(error.message);
      }
      
      if (error instanceof Error && error.message.startsWith('Validation failed:')) {
        const errorMessage = error.message.replace('Validation failed:', '').trim();
        return handleValidationError(errorMessage);
      }
      
      // Handle Zod errors specifically
      if (error && typeof error === 'object' && 'errors' in error) {
        const zodError = error as { errors: Array<{ path: string[]; message: string }> };
        const errorMessages = zodError.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        return handleValidationError(errorMessages.join(', '));
      }
      
      // Generic validation error
      return handleValidationError('Invalid request data');
    }
  };
}

// Helper function to create validation middleware for specific schemas
export function withJsonValidation<T>(
  handler: (req: NextRequest, data: T) => Promise<NextResponse>,
  schema: {
    parse: (data: unknown) => T;
  }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Only allow JSON content type
      const contentType = req.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return createErrorResponse(
          'Content-Type must be application/json',
          415,
          'INVALID_CONTENT_TYPE'
        );
      }

      // Parse JSON body
      const body = await req.text();
      const data = JSON.parse(body);

      // Validate data against schema
      const validatedData = schema.parse(data);
      
      // Call the original handler with validated data
      return await handler(req, validatedData);
    } catch (error) {
      log.error('JSON validation error:', error);
      
      if (error instanceof SyntaxError) {
        return handleValidationError('Invalid JSON format');
      }
      
      return handleValidationError('Invalid request data');
    }
  };
}

// Helper function to create query parameter validation middleware
export function withQueryValidation<T>(
  handler: (req: NextRequest, data: T) => Promise<NextResponse>,
  schema: {
    parse: (data: unknown) => T;
  }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Parse query parameters
      const url = new URL(req.url);
      const queryParams = Object.fromEntries(url.searchParams);
      
      // Validate query parameters against schema
      const validatedData = schema.parse(queryParams);
      
      // Call the original handler with validated data
      return await handler(req, validatedData);
    } catch (error) {
      log.error('Query validation error:', error);
      return handleValidationError('Invalid query parameters');
    }
  };
}