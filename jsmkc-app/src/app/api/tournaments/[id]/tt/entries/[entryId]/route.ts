/**
 * TT (Time Trial) Single Entry API Route
 *
 * Handles read and update operations for individual Time Trial entries.
 * This endpoint supports optimistic locking via a version field to prevent
 * concurrent update conflicts when multiple users edit the same entry.
 *
 * Endpoints:
 * - GET: Fetch a single TT entry by ID with player and tournament data
 * - PUT: Update entry fields (times, totalTime, rank, eliminated, lives)
 *        with optimistic locking (version check)
 *
 * The optimistic locking pattern works as follows:
 * 1. Client reads entry with current version number
 * 2. Client submits update with the version number it read
 * 3. Server checks if the version matches; if not, returns 409 Conflict
 * 4. On match, server increments version and applies the update
 *
 * CRITICAL: Logger is created INSIDE each handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateTTEntry, OptimisticLockError } from "@/lib/optimistic-locking";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/tt/entries/[entryId]
 *
 * Fetch a single Time Trial entry by its ID.
 * Includes related player and tournament data for complete context.
 *
 * Returns 404 if the entry does not exist.
 */
// GET single Time Trial entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('tt-entry-api');
  const { entryId } = await params;
  try {

    // Fetch entry with related player and tournament data
    const entry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: {
        player: true,
        tournament: true,
      },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(entry);
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch entry", { error, entryId });
    return NextResponse.json(
      { success: false, error: "Failed to fetch time trial entry" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/tt/entries/[entryId]
 *
 * Update a Time Trial entry with optimistic locking.
 * The client must provide the current version number to prevent
 * concurrent modification conflicts.
 *
 * Request body:
 * - version: (required) Current version number of the entry
 * - times: Updated course times object
 * - totalTime: Updated total time in milliseconds
 * - rank: Updated rank number
 * - eliminated: Updated elimination status
 * - lives: Updated lives count
 *
 * Returns:
 * - 200: Success with updated entry data and new version number
 * - 400: Missing or invalid version number
 * - 409: Version conflict (entry was modified by another user)
 * - 500: Internal server error
 */
// PUT update Time Trial entry with optimistic locking
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('tt-entry-api');
  const { entryId } = await params;
  try {
    const body = await request.json();

    const { times, totalTime, rank, eliminated, lives, version } = body;

    // Version field is mandatory for optimistic locking
    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

    // Attempt update with optimistic lock check
    // This will throw OptimisticLockError if the version has changed
    const result = await updateTTEntry(
      prisma,
      entryId,
      version,
      {
        times,
        totalTime,
        rank,
        eliminated,
        lives
      }
    );

    // Fetch the fully updated entry with relations for the response
    const updatedEntry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: {
        player: true,
        tournament: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedEntry,
      version: result.version
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update entry", { error, entryId });

    // Handle optimistic lock conflicts with a specific 409 response
    // This tells the client to refresh their data and retry
    if (error instanceof OptimisticLockError) {
      return NextResponse.json(
        {
          success: false,
          error: "Version conflict",
          message: "The entry was modified by another user. Please refresh and try again.",
          currentVersion: error.currentVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to update time trial entry" },
      { status: 500 }
    );
  }
}
