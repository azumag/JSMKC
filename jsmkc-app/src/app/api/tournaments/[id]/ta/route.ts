import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { COURSES, type CourseAbbr } from "@/lib/constants";
import { recalculateRanks } from "@/lib/ta/rank-calculation";
import { timeToMs } from "@/lib/ta/time-utils";
import { promoteToFinals, promoteToRevival1, promoteToRevival2 } from "@/lib/ta/promotion";
import type { PromotionContext } from "@/lib/ta/promotion";

const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;
const StageSchema = z.enum(["qualification", "revival_1", "revival_2", "finals"]);

const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mmm or MM:SS.mmm" }
);

const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

const PostRequestSchema = z.object({
  playerId: z.string().uuid().optional(),
  players: z.array(z.string().uuid()).optional(),
  action: z.enum(["add", "promote_to_finals", "promote_to_revival_1", "promote_to_revival_2"]).optional(),
  topN: z.number().min(1).max(32).optional(),
}).refine(
  (data) => data.playerId !== undefined || (data.players !== undefined && data.players.length > 0),
  { message: "Either playerId or players array is required" }
);

const PutRequestSchema = z.object({
  entryId: z.string().uuid(),
  course: z.string().optional(),
  time: z.string().optional(),
  times: TimesObjectSchema.optional(),
  livesDelta: z.number().optional(),
  eliminated: z.boolean().optional(),
  action: z.enum(["update_times", "update_lives", "eliminate", "reset_lives"]).optional(),
}).refine(
  (data) => data.action === "update_lives" ? data.livesDelta !== undefined :
            data.action === "eliminate" ? data.eliminated !== undefined :
            data.times !== undefined || (data.course !== undefined && data.time !== undefined),
  { message: "Invalid request for action" }
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const uuidSchema = z.string().uuid();
    const parseResult = uuidSchema.safeParse(tournamentId);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const stage = StageSchema.safeParse(searchParams.get("stage"));
    const stageToQuery = stage.success ? stage.data : "qualification";

    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: stageToQuery },
      include: { player: true },
      orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    });

    const [qualCount, finalsCount] = await Promise.all([
      prisma.tTEntry.count({ where: { tournamentId, stage: "qualification" } }),
      prisma.tTEntry.count({ where: { tournamentId, stage: "finals" } }),
    ]);

    return NextResponse.json({
      entries,
      courses: COURSES,
      stage: stageToQuery,
      qualCount,
      finalsCount,
    });
  } catch (error) {
    console.error("Failed to fetch TA data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch time attack data" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const uuidSchema = z.string().uuid();
    const tournamentIdResult = uuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const body = sanitizeInput(await request.json());

    const parseResult = PostRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const { action, playerId, players, topN } = parseResult.data;

    if (action === "promote_to_revival_1") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: "Authentication required for revival promotion" },
          { status: 401 }
        );
      }

      const identifier = getClientIdentifier(request);
      const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      const context: PromotionContext = {
        tournamentId,
        userId: session.user.id,
        ipAddress: getClientIdentifier(request),
        userAgent: getUserAgent(request),
      };

      const result = await promoteToRevival1(prisma, context);
      await recalculateRanks(tournamentId, "revival_1", prisma);

      return NextResponse.json(
        {
          message: "Players promoted to revival round 1",
          entries: result.entries,
          skipped: result.skipped,
        },
        { status: 201 }
      );
    }

    if (action === "promote_to_revival_2") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: "Authentication required for revival promotion" },
          { status: 401 }
        );
      }

      const identifier = getClientIdentifier(request);
      const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      const context: PromotionContext = {
        tournamentId,
        userId: session.user.id,
        ipAddress: getClientIdentifier(request),
        userAgent: getUserAgent(request),
      };

      const result = await promoteToRevival2(prisma, context);
      await recalculateRanks(tournamentId, "revival_2", prisma);

      return NextResponse.json(
        {
          message: "Players promoted to revival round 2",
          entries: result.entries,
          skipped: result.skipped,
        },
        { status: 201 }
      );
    }

    if (action === "promote_to_finals") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: "Authentication required for finals promotion" },
          { status: 401 }
        );
      }

      const identifier = getClientIdentifier(request);
      const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      const context: PromotionContext = {
        tournamentId,
        userId: session.user.id,
        ipAddress: getClientIdentifier(request),
        userAgent: getUserAgent(request),
      };

      const result = await promoteToFinals(prisma, context, topN, players);
      await recalculateRanks(tournamentId, "finals", prisma);

      return NextResponse.json(
        {
          message: "Players promoted to finals",
          entries: result.entries,
          skipped: result.skipped,
        },
        { status: 201 }
      );
    }

    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const playerIds = players || (playerId ? [playerId] : []);
    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    const createdEntries = [];

    for (const pid of playerIds) {
      const existing = await prisma.tTEntry.findUnique({
        where: {
          tournamentId_playerId_stage: {
            tournamentId,
            playerId: pid,
            stage: "qualification",
          },
        },
      });

      if (!existing) {
        const entry = await prisma.tTEntry.create({
          data: {
            tournamentId,
            playerId: pid,
            stage: "qualification",
            times: {},
          },
          include: { player: true },
        });
        createdEntries.push(entry);

        try {
          await createAuditLog({
            ipAddress,
            userAgent,
            action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
            targetId: entry.id,
            targetType: "TTEntry",
            details: {
              tournamentId,
              playerId: pid,
              playerNickname: entry.player.nickname,
            },
          });
        } catch (logError) {
          console.error("Failed to create audit log:", logError);
        }
      }
    }

    return NextResponse.json(
      { message: "Player(s) added to time attack", entries: createdEntries },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to add player to TA:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || "Failed to add player to time attack" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const uuidSchema = z.string().uuid();
    const tournamentIdResult = uuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const body = sanitizeInput(await request.json());

    const parseResult = PutRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const { entryId, action, eliminated } = parseResult.data;

    if (action === "eliminate") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: "Authentication required for delete operations" },
          { status: 401 }
        );
      }

      if (eliminated === undefined) {
        return NextResponse.json(
          { success: false, error: "Either players array or topN is required for promotion" },
          { status: 400 }
        );
      }

      const entry = await prisma.tTEntry.findUnique({
        where: { id: entryId },
        include: { player: true },
      });

      if (!entry) {
        return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });
      }

      const updatedEntry = await prisma.tTEntry.update({
        where: { id: entryId },
        data: { eliminated },
        include: { player: true },
      });

      await recalculateRanks(tournamentId, entry.stage, prisma);

      const ipAddress = getClientIdentifier(request);
      const userAgent = getUserAgent(request);
      try {
        await createAuditLog({
          userId: session.user.id,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: entryId,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerNickname: updatedEntry.player.nickname,
            eliminated,
            manualUpdate: true,
          },
        });
      } catch (logError) {
        console.error("Failed to create audit log:", logError);
      }

      return NextResponse.json({ entry: updatedEntry });
    }

    const { course, time, times: bulkTimes } = parseResult.data;

    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const entry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    const currentTimes = (entry.times as Record<string, string>) || {};
    let updatedTimes: Record<string, string>;

    if (bulkTimes) {
      updatedTimes = { ...currentTimes, ...bulkTimes };
    } else if (course && time !== undefined) {
      if (!COURSES.includes(course as CourseAbbr)) {
        return NextResponse.json(
          { success: false, error: "Invalid course abbreviation" },
          { status: 400 }
        );
      }
      updatedTimes = { ...currentTimes, [course]: time };
    } else {
      return NextResponse.json(
        { success: false, error: "Either (course and time) or times object is required" },
        { status: 400 }
      );
    }

    for (const [c, t] of Object.entries(updatedTimes)) {
      if (t && t !== "" && timeToMs(t) === null) {
        return NextResponse.json(
          { success: false, error: `Invalid time format for ${c}: ${t}` },
          { status: 400 }
        );
      }
    }

    await prisma.tTEntry.update({
      where: { id: entryId },
      data: { times: updatedTimes },
    });

    await recalculateRanks(tournamentId, entry.stage, prisma);

    const finalEntry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);
    try {
      await createAuditLog({
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
        targetId: entryId,
        targetType: "TTEntry",
        details: {
          tournamentId,
          updatedTimes: updatedTimes,
          playerNickname: finalEntry?.player.nickname,
        },
      });
    } catch (logError) {
      console.error("Failed to create audit log:", logError);
    }

    return NextResponse.json({ entry: finalEntry });
  } catch (error) {
    console.error("Failed to update times:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update times" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const uuidSchema = z.string().uuid();
    const tournamentIdResult = uuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("entryId");

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: "entryId is required" },
        { status: 400 }
      );
    }

    const entryIdResult = uuidSchema.safeParse(entryId);
    if (!entryIdResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid entry ID format" },
        { status: 400 }
      );
    }

    const entryToDelete = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

    if (!entryToDelete) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    await prisma.tTEntry.delete({
      where: { id: entryId }
    });

    await recalculateRanks(tournamentId, entryToDelete.stage, prisma);

    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);
    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_TA_ENTRY,
        targetId: entryId,
        targetType: "TTEntry",
        details: {
          tournamentId,
          playerNickname: entryToDelete.player.nickname,
          deletedBy: session.user.email,
          softDeleted: true,
        },
      });
    } catch (logError) {
      console.error("Failed to create audit log:", logError);
    }

    return NextResponse.json({ 
      success: true,
      message: "Entry deleted successfully",
      softDeleted: true 
    });
  } catch (error) {
    console.error("Failed to delete entry:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
