import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, day_start_time, day_end_time } = body;

  if (!id || !day_start_time || !day_end_time) {
    return NextResponse.json(
      { error: "id, day_start_time and day_end_time are required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("crane_logs_sites")
    .update({ day_start_time, day_end_time })
    .eq("id", id);

  if (error) {
    console.error("Supabase update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
