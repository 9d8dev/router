import { neonConfig } from "@neondatabase/serverless";

/**
 * Local development against a plain PostgreSQL server.
 *
 * `@vercel/postgres` only speaks Neon's WebSocket protocol, so a local database
 * needs Neon's `wsproxy` in front of it. Set `POSTGRES_WS_PROXY` to the proxy
 * address (for example `localhost:5433`). When the proxy runs in Docker and the
 * database host in `POSTGRES_URL` is not reachable from inside that container,
 * set `POSTGRES_WS_TARGET` to the address the proxy should dial instead (for
 * example `host.docker.internal:5432`). Production deployments leave both unset.
 */
const proxy = process.env.POSTGRES_WS_PROXY;
if (proxy && process.env.NODE_ENV !== "production") {
  const target = process.env.POSTGRES_WS_TARGET;
  neonConfig.wsProxy = (host, port) =>
    `${proxy}/v1?address=${target ?? `${host}:${port}`}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
