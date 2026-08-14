import pino from "pino";
import { isProd } from "../config/env.js";

export const rootLogger = pino({
  level: isProd ? "info" : "debug",
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash"],
});
