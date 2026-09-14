// Small shared helpers for the Edge API routes under pages/api/pvc/*.
// Kept tiny and dependency-free so every route stays a fast, isolated Edge
// function (see README for why Edge functions were chosen originally).

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function methodNotAllowed(allowed = []) {
  return jsonResponse(
    { error: `Method not allowed. Use ${allowed.join(" or ")}.` },
    405
  );
}

/**
 * Wraps a route handler so any thrown error (including the
 * ELEVENLABS_API_KEY-missing error and any ElevenLabs API error) becomes a
 * clean JSON 500 instead of an unhandled exception / opaque platform error.
 */
export function withErrorHandling(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      console.error("PVC route error:", err);
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      return jsonResponse({ error: message }, 500);
    }
  };
}
