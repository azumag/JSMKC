import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET all tournaments
export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { date: "desc" },
    });
    return NextResponse.json(tournaments);
  } catch (error) {
    console.error("Failed to fetch tournaments:", error);
    return NextResponse.json(
      { error: "Failed to fetch tournaments" },
      { status: 500 }
    );
  }
}

// POST create new tournament
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, date } = body;

    if (!name || !date) {
      return NextResponse.json(
        { error: "Name and date are required" },
        { status: 400 }
      );
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        date: new Date(date),
        status: "draft",
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error("Failed to create tournament:", error);
    return NextResponse.json(
      { error: "Failed to create tournament" },
      { status: 500 }
    );
  }
}
