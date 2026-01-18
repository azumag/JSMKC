import { NextRequest, NextResponse } from "next/server";

// Forward to the main ta endpoint for consistency
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Redirect to the main ta endpoint
  const { id: tournamentId } = await params;
  const { searchParams } = new URL(request.url);
  
  // Preserve search params including token
  const targetUrl = new URL(`/api/tournaments/${tournamentId}/ta`, request.url);
  targetUrl.search = searchParams.toString();
  
  // Forward the request
  const response = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('User-Agent') || '',
    },
  });

  const data = await response.json();
  
  return NextResponse.json(data, { status: response.status });
}