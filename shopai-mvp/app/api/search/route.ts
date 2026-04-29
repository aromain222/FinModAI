import { NextResponse } from "next/server";
import { runShoppingSearch } from "@/lib/shopping/engine";
import { SearchRequest } from "@/lib/shopping/types";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SearchRequest>;

  if (!body.query?.trim()) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const result = runShoppingSearch({
    query: body.query,
    history: body.history ?? [],
    filters: body.filters ?? {}
  });

  return NextResponse.json(result);
}
