/**
 * JSON Schemas for every public route. They drive both request validation
 * (Fastify rejects bad payloads before handlers run) and the generated
 * OpenAPI document served at /docs/api.
 */

const labelledArray = {
  type: "array",
  items: {
    type: "object",
    properties: {
      label: { type: "string" },
      count: { type: "integer" },
    },
    required: ["label", "count"],
  },
} as const;

export const collectSchema = {
  tags: ["ingest"],
  summary: "Record a pageview",
  description:
    "Records a single pageview. Visitor identity is computed server-side as " +
    "SHA-256(IP | User-Agent | daily salt | siteId) and used only in memory: " +
    "the IP is never stored and the hash only feeds a HyperLogLog sketch.",
  body: {
    type: "object",
    required: ["siteId", "path"],
    properties: {
      siteId: {
        type: "string",
        pattern: "^[a-zA-Z0-9._-]{1,64}$",
        description: "Site identifier, as configured in the snippet's data-site attribute.",
      },
      path: {
        type: "string",
        maxLength: 512,
        description: "Page path. Query string and fragment are stripped server-side.",
      },
      referrer: {
        type: "string",
        description: "Full referrer URL. Reduced to its hostname before storage.",
      },
    },
  },
  response: {
    204: { type: "null", description: "Hit recorded." },
    400: {
      type: "object",
      properties: { error: { type: "string" } },
      description: "Invalid siteId or path.",
    },
  },
} as const;

export const statsSchema = {
  tags: ["stats"],
  summary: "Aggregate stats for a site",
  security: [{ bearerAuth: [] }],
  description:
    "Daily uniques and pageviews plus aggregate breakdowns (pages, referrers, " +
    "browsers, OS, devices, languages, countries, hour histogram) over the " +
    "requested range. The range-wide unique total merges daily-salted HLLs, " +
    "so it is an upper bound rather than true cross-day uniques.",
  params: {
    type: "object",
    required: ["siteId"],
    properties: {
      siteId: { type: "string", pattern: "^[a-zA-Z0-9._-]{1,64}$" },
    },
  },
  querystring: {
    type: "object",
    properties: {
      range: {
        type: "integer",
        minimum: 1,
        default: 30,
        description: "Days to aggregate, ending today (UTC). Capped at RETENTION_DAYS.",
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string", format: "date" },
              uniques: { type: "integer" },
              pageviews: { type: "integer" },
            },
            required: ["day", "uniques", "pageviews"],
          },
        },
        totals: {
          type: "object",
          properties: {
            uniques: { type: "integer", description: "Merged-HLL upper bound, not cross-day uniques." },
            pageviews: { type: "integer" },
            pagesPerVisitor: { type: "number" },
          },
        },
        topPaths: {
          type: "array",
          items: {
            type: "object",
            properties: { path: { type: "string" }, count: { type: "integer" } },
          },
        },
        topReferrers: {
          type: "array",
          items: {
            type: "object",
            properties: { referrer: { type: "string" }, count: { type: "integer" } },
          },
        },
        hours: {
          type: "array",
          items: { type: "integer" },
          minItems: 24,
          maxItems: 24,
          description: "Pageviews per UTC hour of day, index 0-23.",
        },
        browsers: labelledArray,
        os: labelledArray,
        devices: labelledArray,
        languages: labelledArray,
        countries: labelledArray,
      },
    },
    400: { type: "object", properties: { error: { type: "string" } } },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const liveSchema = {
  tags: ["stats"],
  summary: "Live visitors",
  security: [{ bearerAuth: [] }],
  description: "Unique visitors seen in roughly the last five minutes.",
  params: {
    type: "object",
    required: ["siteId"],
    properties: {
      siteId: { type: "string", pattern: "^[a-zA-Z0-9._-]{1,64}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: { live: { type: "integer" } },
      required: ["live"],
    },
    400: { type: "object", properties: { error: { type: "string" } } },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const healthSchema = {
  tags: ["system"],
  summary: "Service health",
  description: "Reports API liveness and Redis connectivity.",
  response: {
    200: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "degraded"] },
        redis: { type: "boolean" },
      },
      required: ["status", "redis"],
    },
  },
} as const;

export const sitesSchema = {
  tags: ["stats"],
  summary: "Known site ids",
  description: "Site ids seen within the retention window, most recently active first.",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: { sites: { type: "array", items: { type: "string" } } },
      required: ["sites"],
    },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;
