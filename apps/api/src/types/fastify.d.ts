import "fastify";
import type { AccessTokenPayload } from "../lib/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}
