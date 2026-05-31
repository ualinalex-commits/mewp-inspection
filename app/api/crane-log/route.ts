import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    date,
    site,
    crane,
    supervisor_name,
    company,
    load_description,
    status,
    start_time,
    end_time,
  } = body;

  const { error } = await supabase.from("crane_logs").insert({
    date,
    site,
    crane,
    supervisor_name,
    company,
    load_description,
    status,
    start_time,
    end_time,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
