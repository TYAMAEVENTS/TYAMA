Deno.serve(() =>
  Response.json({
    ok: true,
    service: "supabase-edge-local",
  }),
);
