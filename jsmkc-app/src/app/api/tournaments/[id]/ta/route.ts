import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { COURSES, CourseAbbr } from "@/lib/constants";

// Zod schemas for input validation
const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;

const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mmm or MM:SS.mmm" }
);

const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

const PostRequestSchema = z.object({
  playerId: z.string().uuid().optional(),
  players: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.playerId !== undefined || (data.players !== undefined && data.players.length > 0),
  { message: "Either playerId or players array is required" }
);

const PutRequestSchema = z.object({
  entryId: z.string().uuid(),
  course: z.string().optional(),
  time: z.string().optional(),
  times: TimesObjectSchema.optional(),
}).refine(
  (data) => data.times !== undefined || (data.course !== undefined && data.time !== undefined),
  { message: "Either (course and time) or times object is required" }
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
    };
  });

  // Sort entries with valid total times for ranking
  const sorted = entriesWithTotal
    .filter(e => e.totalTime !== null)
    .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));

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

    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player: true },
      orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    });

    return NextResponse.json({ entries, courses: COURSES });
  } catch (error) {
    console.error("Failed to fetch TA data:", error);
    return NextResponse.json(
      { error: "Failed to fetch time attack data" },
      { status: 500 }
    );
  }
}

// POST add player to time attack
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

    const { playerId, players } = parseResult.data;

    // Handle single player or array of players
    const playerIds = players || (playerId ? [playerId] : []);

    const createdEntries = [];

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

// PUT update times for a player
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

    const { entryId, course, time, times: bulkTimes } = parseResult.data;

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
      // Bulk update all times
      updatedTimes = { ...currentTimes, ...bulkTimes };
    } else if (course && time !== undefined) {
      // Single course update - validate course is in COURSES
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

    // Validate time formats (additional check for single course update)
    for (const [c, t] of Object.entries(updatedTimes)) {
      if (t && t !== "" && timeToMs(t) === null) {
        return NextResponse.json(
          { error: `Invalid time format for ${c}: ${t}` },
          { status: 400 }
        );
      }
    }

    // Update the entry
    await prisma.tTEntry.update({
      where: { id: entryId },
      data: { times: updatedTimes },
    });

    // Recalculate ranks for all entries
    await recalculateRanks(tournamentId);

    // Fetch updated entry with new rank
    const finalEntry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

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

    await prisma.tTEntry.delete({
      where: { id: entryId },
    });

    // Recalculate ranks
    await recalculateRanks(tournamentId);

    return NextResponse.json({ message: "Entry deleted" });
  } catch (error) {
    console.error("Failed to delete entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
