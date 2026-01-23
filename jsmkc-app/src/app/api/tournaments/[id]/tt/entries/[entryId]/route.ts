import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateTTEntry, OptimisticLockError } from "@/lib/optimistic-locking";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('tt-entry-api');

// GET single Time Trial entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  try {

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

// PUT update Time Trial entry with optimistic locking
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  try {
    const body = await request.json();
    
    const { times, totalTime, rank, eliminated, lives, version } = body;

    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

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