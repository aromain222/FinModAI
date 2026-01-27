// app/api/macro/story-summaries/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

type StoryIn = {
  id?: string;
  title: string;
  source?: string;
  publishedAt: string;
  assetClass?: string;
  region?: string;
  direction?: string;
  impact?: number | string;
  channel?: string;
  url?: string;
};

function stableId(s: StoryIn) {
  if (s.id) return s.id;
  const base = `${s.title ?? ""}|${s.publishedAt ?? ""}|${s.source ?? ""}`;
  return crypto.createHash("sha1").update(base).digest("hex");
}

function clamp2to4Sentences(text: string) {
  const cleaned = (text || "").trim().replace(/\s+/g, " ");
  // Split on sentence-ish boundaries
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const sliced = parts.slice(0, 4);
  if (sliced.length < 2) return cleaned; // if model returns 1 sentence, leave it
  return sliced.join(" ");
}

function fallbackSummary(s: StoryIn) {
  const topic = (s.title || "This story").replace(/\s+/g, " ").trim();
  const asset = (s.assetClass || s.channel || "markets").toLowerCase();
  const region = s.region ? s.region : "global";
  const direction = s.direction ? s.direction.toLowerCase() : "mixed";
  const channel = s.channel ? s.channel.toLowerCase() : "macro";
  const source = s.source ? `Source: ${s.source}.` : "";
  const timing = s.publishedAt ? `Time: ${s.publishedAt}.` : "";

  const inferredExposure =
    asset.includes("energy") || topic.toLowerCase().includes("oil")
      ? "energy producers vs fuel-intensive industries"
      : asset.includes("rates") || channel.includes("rates")
      ? "rate-sensitive assets, duration trades, and credit spreads"
      : asset.includes("fx") || channel.includes("fx")
      ? "exporters, import costs, and dollar-linked assets"
      : asset.includes("equities")
      ? "equity risk, cyclicals vs defensives"
      : "broader risk assets tied to the theme";

  const why =
    direction === "bullish"
      ? "Supports risk appetite if price action confirms."
      : direction === "bearish"
      ? "Signals potential de-risking unless data/price action stabilizes."
      : "Needs confirmation in prices before taking directional risk.";

  const sentences = [
    `${topic} points to a ${direction} tone for ${asset} in ${region}, linked to ${channel}.`,
    `Why it matters: ${why}`,
    `Who is affected: ${inferredExposure}.`,
    `${source} ${timing}`.trim(),
  ].filter(Boolean);

  return clamp2to4Sentences(sentences.join(" "));
}

async function openAiSummarize(story: StoryIn) {
  const apiKey = process.env.OPENAI_API_KEY;
  const hasKey = Boolean(apiKey);
  if (!hasKey) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = [
    "You write institutional fintech-terminal story summaries.",
    "Output MUST be 2–4 sentences MAX.",
    "Be specific to the story subject (do not write generic 'may influence sentiment').",
    "Include exactly: (1) why it matters (so what), (2) who is affected (sectors/assets).",
    "No forecasts. No invented numbers. No emojis. No hype. Do not ask for more data.",
    "If the story is vague, write a conservative monitor-only summary that still references the topic.",
  ].join(" ");

  const user = {
    title: story.title,
    source: story.source,
    publishedAt: story.publishedAt,
    assetClass: story.assetClass,
    region: story.region,
    direction: story.direction,
    impact: story.impact,
    channel: story.channel,
    url: story.url,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            "Write the required 2–4 sentence summary using ONLY these fields:\n" +
            JSON.stringify(user),
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[story-summaries] OpenAI error", {
      status: res.status,
      statusText: res.statusText,
      trace: txt?.slice(0, 500) ?? "",
    });
    throw new Error(`OpenAI error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  return clamp2to4Sentences(text);
}

export async function POST(req: Request) {
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json();
    const stories: StoryIn[] = Array.isArray(body?.stories) ? body.stories : [];
    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    console.log("[story-summaries] request", {
      traceId,
      storiesCount: stories.length,
      hasApiKey: hasKey,
    });

    const summariesById: Record<string, { summaryText: string; mode: "ai" | "fallback" }> = {};

    // No stories -> return empty map (frontend should still render fallback UI)
    if (!stories.length) {
      return NextResponse.json({ traceId, summariesById }, { status: 200 });
    }

    // Limit to prevent runaway cost (still non-breaking)
    const capped = stories.slice(0, 30);

    // Parallelize, but keep results aligned by stable id
    await Promise.all(
      capped.map(async (s) => {
        const id = stableId(s);
        try {
          const summaryText = await openAiSummarize(s);
          const text = summaryText?.trim();
          // Ensure summaryText is never empty
          const finalText = text && text.length > 0 ? text : fallbackSummary(s);
          summariesById[id] = { 
            summaryText: finalText, 
            mode: text && text.length > 0 ? "ai" : "fallback" 
          };
        } catch (err: any) {
          console.error("[story-summaries] using fallback", {
            traceId,
            id,
            err: String(err?.message ?? err),
          });
          // Always return fallback - never empty
          summariesById[id] = { 
            summaryText: fallbackSummary(s), 
            mode: "fallback" 
          };
        }
      })
    );

    return NextResponse.json(
      { traceId, summariesById },
      { status: 200 }
    );
  } catch (e: any) {
    // Hard failure -> still return something deterministic
    return NextResponse.json(
      { traceId, summariesById: {}, error: String(e?.message ?? e) },
      { status: 200 }
    );
  }
}
