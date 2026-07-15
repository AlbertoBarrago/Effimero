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
    403: { type: "object", properties: { error: { type: "string" } }, description: "Token not authorized for this site." },
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
    403: { type: "object", properties: { error: { type: "string" } }, description: "Token not authorized for this site." },
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

const SITE_ID = { type: "string", pattern: "^[a-zA-Z0-9._-]{1,64}$" } as const;

/** Array of origin strings, e.g. "https://example.com" (scheme + host[:port], no path). */
const originsArray = {
  type: "array",
  items: { type: "string", pattern: "^https?://[^/]+$", maxLength: 253 },
  maxItems: 50,
  default: [],
  description: "Origins permitted to send hits. Empty means any.",
} as const;

const siteConfigObject = {
  type: "object",
  properties: {
    siteId: { type: "string" },
    allowedOrigins: { type: "array", items: { type: "string" } },
    active: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
  },
  required: ["siteId", "allowedOrigins", "active", "createdAt"],
} as const;

export const registerSiteSchema = {
  tags: ["admin"],
  summary: "Register a site",
  description:
    "Registers a site so /collect will accept hits for it. Ingest rejects any " +
    "siteId that is not registered. When allowedOrigins is non-empty, only hits " +
    "whose Origin matches an entry are recorded; empty means any origin.",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["siteId"],
    properties: {
      siteId: SITE_ID,
      allowedOrigins: originsArray,
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        ...siteConfigObject.properties,
        readToken: {
          type: "string",
          description: "Per-site read token. Shown ONCE at creation; store it now. Only its hash is kept.",
        },
      },
      required: [...siteConfigObject.required, "readToken"],
    },
    400: { type: "object", properties: { error: { type: "string" } } },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const updateSiteSchema = {
  tags: ["admin"],
  summary: "Update a site's allowed origins",
  description: "Replaces the site's allowedOrigins list. Does not affect the read token.",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["siteId"],
    properties: { siteId: SITE_ID },
  },
  body: {
    type: "object",
    required: ["allowedOrigins"],
    properties: { allowedOrigins: originsArray },
  },
  response: {
    200: siteConfigObject,
    400: { type: "object", properties: { error: { type: "string" } } },
    404: { type: "object", properties: { error: { type: "string" } }, description: "Site was not registered." },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const rotateTokenSchema = {
  tags: ["admin"],
  summary: "Rotate a site's read token",
  description: "Issues a new read token for the site and invalidates the previous one. Shown once.",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["siteId"],
    properties: { siteId: SITE_ID },
  },
  response: {
    200: {
      type: "object",
      properties: {
        siteId: { type: "string" },
        readToken: { type: "string", description: "New read token. Shown once." },
      },
      required: ["siteId", "readToken"],
    },
    404: { type: "object", properties: { error: { type: "string" } }, description: "Site was not registered." },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const listSitesSchema = {
  tags: ["admin"],
  summary: "List registered sites",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: { sites: { type: "array", items: siteConfigObject } },
      required: ["sites"],
    },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;

export const deleteSiteSchema = {
  tags: ["admin"],
  summary: "Remove a registered site",
  description: "Removes a site from the registry. Existing aggregate stats keys are left to expire via retention.",
  security: [{ bearerAuth: [] }],
  params: {
    type: "object",
    required: ["siteId"],
    properties: { siteId: SITE_ID },
  },
  response: {
    204: { type: "null", description: "Site removed." },
    404: { type: "object", properties: { error: { type: "string" } }, description: "Site was not registered." },
    401: { type: "object", properties: { error: { type: "string" } }, description: "Missing or invalid access key." },
  },
} as const;
