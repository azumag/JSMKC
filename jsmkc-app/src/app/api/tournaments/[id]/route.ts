import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET single tournament with related data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        bmQualifications: {
          include: { player: true },
          orderBy: [{ group: "asc" }, { score: "desc" }],
        },
        bmMatches: {
          include: {
            player1: true,
            player2: true,
          },
          orderBy: { matchNumber: "asc" },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("Failed to fetch tournament:", error);
    return NextResponse.json(
      { error: "Failed to fetch tournament" },
      { status: 500 }
    );
  }
}

// PUT update tournament
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, date, status } = body;

    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(date && { date: new Date(date) }),
        ...(status && { status }),
      },
    });

    return NextResponse.json(tournament);
  } catch (error: unknown) {
    console.error("Failed to update tournament:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update tournament" },
      { status: 500 }
    );
  }
}

// DELETE tournament
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.tournament.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Tournament deleted successfully" });
  } catch (error: unknown) {
    console.error("Failed to delete tournament:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete tournament" },
      { status: 500 }
    );
  }
}
