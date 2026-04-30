/**
 * Broadcast State API
 *
 * GET  /api/tournaments/[id]/broadcast  - Fetch current overlay player names (public)
 * PUT  /api/tournaments/[id]/broadcast  - Set overlay player names (admin only)
 *
 * Stores the 1P/2P display names shown on the OBS overlay at fixed positions.
 * Admin sets them by clicking "配信に反映" on a match row or via the 配信管理 page.
 * The overlay dashboard polls this via overlay-events; we also expose it
 * directly so the 配信管理 page can read/write without re-deriving the state
 * from a wider events payload.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveTournament } from "@/lib/tournament-identifier";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
  handleValidationError,
} from "@/lib/error-handling";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

const MAX_NAME_LENGTH = 50;

/**
 * GET /api/tournaments/[id]/broadcast
 *
 * Returns the current overlay player names and match info.
 * Public — the overlay page reads this on each poll.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger("broadcast-api");
  const { id } = await params;

  try {
    /* Single query: fold slug/id resolution + field fetch (#692) */
    const tournament = await resolveTournament(id, {
      overlayPlayer1Name: true,
      overlayPlayer2Name: true,
      overlayPlayer1NoCamera: true,
      overlayPlayer2NoCamera: true,
      overlayMatchLabel: true,
      overlayPlayer1Wins: true,
      overlayPlayer2Wins: true,
      overlayMatchFt: true,
    });

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }

    return createSuccessResponse({
      player1Name: tournament.overlayPlayer1Name ?? "",
      player2Name: tournament.overlayPlayer2Name ?? "",
      player1NoCamera: tournament.overlayPlayer1NoCamera ?? false,
      player2NoCamera: tournament.overlayPlayer2NoCamera ?? false,
      matchLabel: tournament.overlayMatchLabel ?? null,
      player1Wins: tournament.overlayPlayer1Wins ?? null,
      player2Wins: tournament.overlayPlayer2Wins ?? null,
      matchFt: tournament.overlayMatchFt ?? null,
    });
  } catch (error) {
    logger.error("Failed to fetch broadcast state", { error, tournamentId: id });
    return createErrorResponse("Failed to fetch broadcast state", 500);
  }
}

const MAX_LABEL_LENGTH = 50;

/**
 * PUT /api/tournaments/[id]/broadcast
 *
 * Updates the overlay player names and optional match info.
 * Requires admin authentication.
 *
 * Body: { player1Name?, player2Name?, matchLabel?, player1Wins?, player2Wins?, matchFt? }
 * Any field may be omitted to leave it unchanged.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger("broadcast-api");

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return handleAuthzError();
  }

  const { id } = await params;

  try {
    const body = sanitizeInput(await request.json()) as Record<string, unknown>;
    const {
      player1Name,
      player2Name,
      player1NoCamera,
      player2NoCamera,
      matchLabel,
      player1Wins,
      player2Wins,
      matchFt,
    } = body;

    /* Allow null/empty string to clear the field; reject only invalid types. */
    if (player1Name !== undefined && player1Name !== null && typeof player1Name !== "string") {
      return handleValidationError("player1Name must be a string", "player1Name");
    }
    if (player2Name !== undefined && player2Name !== null && typeof player2Name !== "string") {
      return handleValidationError("player2Name must be a string", "player2Name");
    }
    if (typeof player1Name === "string" && player1Name.length > MAX_NAME_LENGTH) {
      return handleValidationError(`player1Name must be at most ${MAX_NAME_LENGTH} characters`, "player1Name");
    }
    if (typeof player2Name === "string" && player2Name.length > MAX_NAME_LENGTH) {
      return handleValidationError(`player2Name must be at most ${MAX_NAME_LENGTH} characters`, "player2Name");
    }
    if (player1NoCamera !== undefined && typeof player1NoCamera !== "boolean") {
      return handleValidationError("player1NoCamera must be a boolean", "player1NoCamera");
    }
    if (player2NoCamera !== undefined && typeof player2NoCamera !== "boolean") {
      return handleValidationError("player2NoCamera must be a boolean", "player2NoCamera");
    }
    if (matchLabel !== undefined && matchLabel !== null && typeof matchLabel !== "string") {
      return handleValidationError("matchLabel must be a string", "matchLabel");
    }
    if (typeof matchLabel === "string" && matchLabel.length > MAX_LABEL_LENGTH) {
      return handleValidationError(`matchLabel must be at most ${MAX_LABEL_LENGTH} characters`, "matchLabel");
    }
    if (player1Wins !== undefined && player1Wins !== null && typeof player1Wins !== "number") {
      return handleValidationError("player1Wins must be a number", "player1Wins");
    }
    if (player2Wins !== undefined && player2Wins !== null && typeof player2Wins !== "number") {
      return handleValidationError("player2Wins must be a number", "player2Wins");
    }
    if (matchFt !== undefined && matchFt !== null && typeof matchFt !== "number") {
      return handleValidationError("matchFt must be a number", "matchFt");
    }

    /* Single query: fold slug/id resolution + existence check (#692) */
    const tournament = await resolveTournament(id, { id: true });
    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }
    const tournamentId = tournament.id;

    const updateData: Record<string, string | number | boolean | null> = {};
    if (player1Name !== undefined) {
      updateData.overlayPlayer1Name = player1Name === null ? null : (player1Name as string).trim() || null;
      if (player1NoCamera === undefined) updateData.overlayPlayer1NoCamera = false;
    }
    if (player2Name !== undefined) {
      updateData.overlayPlayer2Name = player2Name === null ? null : (player2Name as string).trim() || null;
      if (player2NoCamera === undefined) updateData.overlayPlayer2NoCamera = false;
    }
    if (player1NoCamera !== undefined) {
      updateData.overlayPlayer1NoCamera = player1NoCamera as boolean;
    }
    if (player2NoCamera !== undefined) {
      updateData.overlayPlayer2NoCamera = player2NoCamera as boolean;
    }
    if (matchLabel !== undefined) {
      updateData.overlayMatchLabel = matchLabel === null ? null : (matchLabel as string).trim() || null;
    }
    if (player1Wins !== undefined) {
      updateData.overlayPlayer1Wins = player1Wins === null ? null : (player1Wins as number);
    }
    if (player2Wins !== undefined) {
      updateData.overlayPlayer2Wins = player2Wins === null ? null : (player2Wins as number);
    }
    if (matchFt !== undefined) {
      updateData.overlayMatchFt = matchFt === null ? null : (matchFt as number);
    }

    if (Object.keys(updateData).length === 0) {
      return handleValidationError("At least one field is required", "body");
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: updateData,
    });

    return createSuccessResponse({
      player1Name: updateData.overlayPlayer1Name !== undefined
        ? (updateData.overlayPlayer1Name ?? "")
        : undefined,
      player2Name: updateData.overlayPlayer2Name !== undefined
        ? (updateData.overlayPlayer2Name ?? "")
        : undefined,
      player1NoCamera: updateData.overlayPlayer1NoCamera !== undefined
        ? Boolean(updateData.overlayPlayer1NoCamera)
        : undefined,
      player2NoCamera: updateData.overlayPlayer2NoCamera !== undefined
        ? Boolean(updateData.overlayPlayer2NoCamera)
        : undefined,
      matchLabel: updateData.overlayMatchLabel !== undefined
        ? (updateData.overlayMatchLabel ?? null)
        : undefined,
      player1Wins: updateData.overlayPlayer1Wins !== undefined
        ? (updateData.overlayPlayer1Wins ?? null)
        : undefined,
      player2Wins: updateData.overlayPlayer2Wins !== undefined
        ? (updateData.overlayPlayer2Wins ?? null)
        : undefined,
      matchFt: updateData.overlayMatchFt !== undefined
        ? (updateData.overlayMatchFt ?? null)
        : undefined,
    });
  } catch (error) {
    logger.error("Failed to update broadcast state", { error, tournamentId: id });
    return createErrorResponse("Failed to update broadcast state", 500);
  }
}
