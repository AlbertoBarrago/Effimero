import type { FastifyLoggerOptions } from "fastify";

/**
 * Request logging is intentionally sparse: IP, User-Agent and headers are
 * inputs to privacy-preserving aggregation, but must never be written to logs.
 */
export const privacyLogger = {
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
      };
    },
    res(reply) {
      return {
        statusCode: reply.statusCode,
      };
    },
  },
} satisfies FastifyLoggerOptions;
