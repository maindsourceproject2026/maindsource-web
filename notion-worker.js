/**
 * ═══════════════════════════════════════════════════════════════
 *  MAINDSOURCE — Cloudflare Worker: Notion Jobs API Proxy
 *  File: notion-worker.js
 *
 *  DEPLOY INSTRUCTIONS (5 minutes, free):
 *  1. Go to dash.cloudflare.com → Workers & Pages → Create Worker
 *  2. Click "Edit Code" → paste this entire file → Save & Deploy
 *  3. Set your secrets in: Worker → Settings → Variables:
 *       NOTION_SECRET    = secret_xxxxxxxxxxxxxxxxxx  (your Notion API key)
 *       NOTION_DB_ID     = your_database_id_here      (32-char ID from Notion URL)
 *  4. Under Worker → Settings → Triggers:
 *       Add Custom Domain route: maindsource.in/api/jobs
 *  5. Done. careers.html calls /api/jobs and gets live jobs.
 *
 *  HOW SURYA (CLIENT) ADDS/REMOVES JOBS IN NOTION:
 *  - Open the Notion database
 *  - Click "+ New" to add a job
 *  - Fill: Title, Department, Location, Type, Status
 *  - Set Status = "Published" to make it live
 *  - Set Status = "Draft" to hide it from website
 *  - Changes appear on website within seconds
 *
 *  NOTION DATABASE COLUMNS NEEDED:
 *  | Column Name | Type   | Values                            |
 *  |-------------|--------|-----------------------------------|
 *  | Title       | Title  | Job title text                    |
 *  | Department  | Select | Operations / Sales / Recruiting   |
 *  | Location    | Text   | e.g. Bangalore / Ballari          |
 *  | Type        | Select | Full Time / Contract / Part Time  |
 *  | Status      | Select | Published / Draft                 |
 * ═══════════════════════════════════════════════════════════════
 */

export default {
  async fetch(request, env) {

    // Only allow GET /api/jobs
    const url = new URL(request.url);
    if (url.pathname !== '/api/jobs') {
      return new Response('Not found', { status: 404 });
    }

    // CORS headers — allows your website to call this worker
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Type': 'application/json',
    };

    try {
      // Call Notion API
      const notionRes = await fetch(
        `https://api.notion.com/v1/databases/${env.NOTION_DB_ID}/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.NOTION_SECRET}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Only return Published jobs
            filter: {
              property: 'Status',
              select: { equals: 'Published' }
            },
            // Newest first
            sorts: [{ timestamp: 'created_time', direction: 'descending' }]
          }),
        }
      );

      if (!notionRes.ok) {
        const err = await notionRes.text();
        console.error('Notion API error:', err);
        return new Response(JSON.stringify({ error: 'Notion error' }), {
          status: 500, headers: corsHeaders
        });
      }

      const notionData = await notionRes.json();

      // Transform Notion response → clean job objects for the website
      const jobs = notionData.results.map(page => {
        const props = page.properties;
        return {
          id:         page.id,
          title:      props.Title?.title?.[0]?.plain_text      || 'Untitled Role',
          department: props.Department?.select?.name            || 'General',
          location:   props.Location?.rich_text?.[0]?.plain_text || 'Bangalore',
          type:       props.Type?.select?.name                  || 'Full Time',
        };
      });

      return new Response(JSON.stringify(jobs), {
        status: 200, headers: corsHeaders
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500, headers: corsHeaders
      });
    }
  }
};