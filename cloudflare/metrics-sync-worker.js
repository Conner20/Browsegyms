export default {
  async scheduled(_controller, env, context) {
    context.waitUntil(runSync(env));
  },
};

async function runSync(env) {
  const response = await fetch(env.BROWSEGYMS_SYNC_URL, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`Browse Gyms metrics sync failed (${response.status}): ${responseBody.slice(0, 500)}`);
  }

  let result;
  try {
    result = JSON.parse(responseBody);
  } catch {
    throw new Error(`Browse Gyms metrics sync returned an invalid response: ${responseBody.slice(0, 500)}`);
  }

  if (!result?.ok) {
    throw new Error(`Browse Gyms metrics sync did not report success: ${responseBody.slice(0, 500)}`);
  }

  console.log("Browse Gyms metrics sync completed", {
    status: response.status,
    spreadsheetId: result.spreadsheetId,
    tabs: result.tabs,
    rows: result.rows,
    syncedAt: result.syncedAt,
  });

  return new Response("Metrics synced", { status: 200 });
}
