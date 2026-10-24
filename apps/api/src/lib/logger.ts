import { type Logger, type LoggerOptions, pino } from "pino";

export interface LoggerConfig {
  name: string;
  level: string;
  pretty: boolean;
}

/**
 * Structured JSON logs (one line per event) in production; pretty-printed
 * in dev. Shared by the API (as Fastify's logger) and the worker.
 */
export function createLogger({ name, level, pretty }: LoggerConfig): Logger {
  const options: LoggerOptions = {
    name,
    level,
    // Belt and braces: none of these should ever be logged, but if one
    // ends up in a logged object it's masked.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        "*.password",
        "*.authHash",
        "*.token",
        "*.secret",
      ],
      censor: "[redacted]",
    },
  };
  if (pretty) {
    options.transport = {
      target: "pino-pretty",
      options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
    };
  }
  return pino(options);
}
