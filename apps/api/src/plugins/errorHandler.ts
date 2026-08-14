import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { logAction } from "../lib/gameLog.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Nieprawidłowe dane", details: error.flatten() });
    }

    if (error.validation) {
      return reply.code(400).send({ error: "Nieprawidłowe dane", details: error.validation });
    }

    const statusCode = error.statusCode ?? 500;

    request.log.error({ err: error, statusCode }, "Unhandled request error");

    await logAction({
      module: "http",
      action: "unhandled_error",
      level: statusCode >= 500 ? "error" : "warn",
      actorUserId: request.user?.sub ?? null,
      requestId: request.id,
      payload: { message: error.message, url: request.url, method: request.method, statusCode },
    });

    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? "Wewnętrzny błąd serwera" : error.message });
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({ error: "Nie znaleziono", path: request.url });
  });
}
