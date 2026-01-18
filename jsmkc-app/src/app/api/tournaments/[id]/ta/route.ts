import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { COURSES, CourseAbbr } from "@/lib/constants";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";

// Zod schemas for input validation
const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;
const StageSchema = z.enum(["qualification", "finals"]);

const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mmm or MM:SS.mmm" }
);

const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

const PostRequestSchema = z.object({
  playerId: z.string().uuid().optional(),
  players: z.array(z.string().uuid()).optional(),
  action: z.enum(["add", "promote_to_finals"]).optional(),
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
  action: z.enum(["update_times", "update_lives", "eliminate"]).optional(),
}).refine(
  (data) => data.action === "update_lives" ? data.livesDelta !== undefined :
            data.action === "eliminate" ? data.eliminated !== undefined :
            data.times !== undefined || (data.course !== undefined && data.time !== undefined),
  { message: "Invalid request for action" }
);

// Convert time string (MM:SS.mmm or M:SS.mmm) to milliseconds
function timeToMs(time: string): number | null {
  if (!time || time === "") return null;

  const match = time.match(timeFormatRegex);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let ms = match[3];
  // Pad milliseconds to 3 digits
  while (ms.length < 3) ms += "0";
  const milliseconds = parseInt(ms, 10);

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

// Calculate total time and update ranks for all entries using batch update
async function recalculateRanks(tournamentId: string, stage: string = "qualification") {
  const entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage },
    include: { player: true },
  });

  // Calculate total time for each entry
  const entriesWithTotal = entries.map(entry => {
    const times = entry.times as Record<string, string> | null;
    let totalMs = 0;
    let allTimesEntered = true;

    if (times) {
      for (const course of COURSES) {
        const courseTime = times[course];
        const ms = timeToMs(courseTime);
        if (ms !== null) {
          totalMs += ms;
        } else {
          allTimesEntered = false;
        }
      }
    } else {
      allTimesEntered = false;
    }

    return {
      id: entry.id,
      totalTime: allTimesEntered ? totalMs : null,
      lives: entry.lives,
      eliminated: entry.eliminated,
    };
  });

  let sorted;

  if (stage === "finals") {
    // Finals ranking: Not eliminated first, then by lives (desc), then by totalTime (asc)
    sorted = entriesWithTotal.sort((a, b) => {
      // Eliminated players go last
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }
      // More lives = better (descending)
      if (a.lives !== b.lives) {
        return b.lives - a.lives;
      }
      // Less time = better (ascending), but eliminated or no time go to end
      if (a.eliminated || b.eliminated) return 0;
      if (a.totalTime === null) return 1;
      if (b.totalTime === null) return -1;
      return (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
    });
  } else {
    // Qualification: Sort by total time
    sorted = entriesWithTotal
      .filter(e => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
  }

  // Create a Map for O(1) rank lookup instead of O(N) findIndex
  const rankMap = new Map<string, number>();
  sorted.forEach((entry, index) => {
    rankMap.set(entry.id, index + 1);
  });

  // Batch update all entries using transaction
  const updateOperations = entriesWithTotal.map(entry => {
    const rank = rankMap.get(entry.id) ?? null;
    return prisma.tTEntry.update({
      where: { id: entry.id },
      data: {
        totalTime: entry.totalTime,
        rank,
      },
    });
  });

  await prisma.$transaction(updateOperations);
}

// GET time attack entries
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    // Validate tournamentId is a valid UUID
    const uuidSchema = z.string().uuid();
    const parseResult = uuidSchema.safeParse(tournamentId);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    // Get stage from query params, default to qualification
    const { searchParams } = new URL(request.url);
    const stage = StageSchema.safeParse(searchParams.get("stage"));
    const stageToQuery = stage.success ? stage.data : "qualification";

    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: stageToQuery },
      include: { player: true },
      orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    });

    // Fetch both qualification and finals counts for status
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
      { error: "Failed to fetch time attack data" },
      { status: 500 }
    );
  }
}

// POST add player to time attack or promote to finals
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    // Validate tournamentId
    const uuidSchema = z.string().uuid();
    const tournamentIdResult = uuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate request body with zod
    const parseResult = PostRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const { action, playerId, players, topN } = parseResult.data;

    // Handle promoting to finals
    if (action === "promote_to_finals") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { error: "Authentication required for finals promotion" },
          { status: 401 }
        );
      }

      // Rate limiting for promotion
      const identifier = getClientIdentifier(request);
      const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000); // 5 requests per minute
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      const ipAddress = getClientIdentifier(request);
      const userAgent = getUserAgent(request);

      // Get top N qualifiers
      let qualifiers;
      if (topN) {
        qualifiers = await prisma.tTEntry.findMany({
          where: { tournamentId, stage: "qualification" },
          include: { player: true },
          orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
          take: topN,
        });
      } else if (players && players.length > 0) {
        qualifiers = await prisma.tTEntry.findMany({
          where: { tournamentId, stage: "qualification", playerId: { in: players } },
          include: { player: true },
        });
      } else {
        return NextResponse.json(
          { error: "Either players array or topN is required for promotion" },
          { status: 400 }
        );
      }

      if (qualifiers.length === 0) {
        return NextResponse.json(
          { error: "No qualifying players found" },
          { status: 400 }
        );
      }

      const createdEntries = [];
      const skippedEntries = [];

      for (const qual of qualifiers) {
        if (qual.totalTime === null) {
          skippedEntries.push(qual.player.nickname);
          continue;
        }

        // Check if already in finals
        const existingFinals = await prisma.tTEntry.findUnique({
          where: {
            tournamentId_playerId_stage: {
              tournamentId,
              playerId: qual.playerId,
              stage: "finals",
            },
          },
        });

        if (!existingFinals) {
          const entry = await prisma.tTEntry.create({
            data: {
              tournamentId,
              playerId: qual.playerId,
              stage: "finals",
              lives: 3,
              eliminated: false,
              times: {},
            },
            include: { player: true },
          });
          createdEntries.push(entry);

          // Audit log
          try {
            await createAuditLog({
              userId: session.user.id,
              ipAddress,
              userAgent,
              action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
              targetId: entry.id,
              targetType: "TTEntry",
              details: {
                tournamentId,
                playerId: qual.playerId,
                playerNickname: entry.player.nickname,
                qualRank: qual.rank,
                promotedTo: "finals",
              },
            });
          } catch (logError) {
            console.error("Failed to create audit log:", logError);
          }
        }
      }

      // Recalculate finals ranks
      await recalculateRanks(tournamentId, "finals");

      return NextResponse.json(
        {
          message: "Players promoted to finals",
          entries: createdEntries,
          skipped: skippedEntries,
        },
        { status: 201 }
      );
    }

    // Handle adding players to qualification
    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 10, 60 * 1000); // 10 requests per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const playerIds = players || (playerId ? [playerId] : []);

    const createdEntries = [];
    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    for (const pid of playerIds) {
      // Check if player already exists in this tournament
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

        // Audit log
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
      { error: "Failed to add player to time attack" },
      { status: 500 }
    );
  }
}

// PUT update times, lives, or elimination status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    // Validate tournamentId
    const uuidSchema = z.string().uuid();
    const tournamentIdResult = uuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return NextResponse.json(
        { error: "Invalid tournament ID format" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate request body with zod
    const parseResult = PutRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const { entryId, action, livesDelta, eliminated } = parseResult.data;

    // Handle elimination
    if (action === "eliminate") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { error: "Authentication required for elimination" },
          { status: 401 }
        );
      }

      if (eliminated === undefined) {
        return NextResponse.json(
          { error: "eliminated boolean is required for eliminate action" },
          { status: 400 }
        );
      }

      const entry = await prisma.tTEntry.findUnique({
        where: { id: entryId },
        include: { player: true },
      });

      if (!entry) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      const updatedEntry = await prisma.tTEntry.update({
        where: { id: entryId },
        data: { eliminated },
        include: { player: true },
      });

      // Recalculate ranks
      await recalculateRanks(tournamentId, entry.stage);

      // Audit log
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

    // Handle lives update
    if (action === "update_lives") {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { error: "Authentication required for lives update" },
          { status: 401 }
        );
      }

      if (livesDelta === undefined) {
        return NextResponse.json(
          { error: "livesDelta is required for update_lives action" },
          { status: 400 }
        );
      }

      const entry = await prisma.tTEntry.findUnique({
        where: { id: entryId },
        include: { player: true },
      });

      if (!entry) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      const newLives = entry.lives + livesDelta;
      const newEliminated = newLives <= 0;

      const updatedEntry = await prisma.tTEntry.update({
        where: { id: entryId },
        data: {
          lives: Math.max(0, newLives),
          eliminated: newEliminated,
        },
        include: { player: true },
      });

      // Recalculate ranks
      await recalculateRanks(tournamentId, entry.stage);

      // Audit log
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
            oldLives: entry.lives,
            newLives: updatedEntry.lives,
            eliminated: updatedEntry.eliminated,
          },
        });
      } catch (logError) {
        console.error("Failed to create audit log:", logError);
      }

      return NextResponse.json({ entry: updatedEntry });
    }

    // Handle times update (default action)
    const { course, time, times: bulkTimes } = parseResult.data;

    // Rate limiting
    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 10, 60 * 1000); // 10 requests per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Get current entry
    const entry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Entry not found" },
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
          { error: "Invalid course abbreviation" },
          { status: 400 }
        );
      }
      updatedTimes = { ...currentTimes, [course]: time };
    } else {
      return NextResponse.json(
        { error: "Either (course and time) or times object is required" },
        { status: 400 }
      );
    }

    for (const [c, t] of Object.entries(updatedTimes)) {
      if (t && t !== "" && timeToMs(t) === null) {
        return NextResponse.json(
          { error: `Invalid time format for ${c}: ${t}` },
          { status: 400 }
        );
      }
    }

    await prisma.tTEntry.update({
      where: { id: entryId },
      data: { times: updatedTimes },
    });

    await recalculateRanks(tournamentId, entry.stage);

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
      { error: "Failed to update times" },
      { status: 500 }
    );
  }
}

// DELETE remove player from time attack
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    // Get session for authentication (DELETE requires auth)
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required for delete operations" },
        { status: 401 }
      );
    }

    // Rate limiting
    const identifier = getClientIdentifier(request);
    const rateLimitResult = await rateLimit(identifier, 5, 60 * 1000); // 5 delete requests per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Validate tournamentId
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
        { error: "entryId is required" },
        { status: 400 }
      );
    }

    // Validate entryId is a valid UUID
    const entryIdResult = uuidSchema.safeParse(entryId);
    if (!entryIdResult.success) {
      return NextResponse.json(
        { error: "Invalid entry ID format" },
        { status: 400 }
      );
    }

    // Get entry details for audit log before deletion
    const entryToDelete = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

    if (!entryToDelete) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    await prisma.tTEntry.delete({
      where: { id: entryId },
    });

    // Recalculate ranks
    await recalculateRanks(tournamentId);

    // Audit log
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
        },
      });
    } catch (logError) {
      console.error("Failed to create audit log:", logError);
    }

    return NextResponse.json({ message: "Entry deleted" });
  } catch (error) {
    console.error("Failed to delete entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
