import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { promisify } from "node:util";

import { createEffectActor, sendAndAwait } from "@xstate/effect";
import { Effect, Schedule } from "effect";
import { WebSocketServer } from "ws";

import { clientPresence, frameLimit } from "./client-presence.mjs";
import { runtimeService } from "./runtime-service.mjs";
import { serverMachine } from "./server-lifecycle.mjs";
import { serviceRegistration } from "./service-registration.mjs";

const equal = (a, b) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const addressPort = (server) => {
  const address = server.address();
  if (!address) throw Error("Listener is not bound");
  // SAFETY: a loopback TCP listener returns AddressInfo, never a Unix socket path.
  return address.port;
};
export function managedHost({ store, build, port = 0, viewer }) {
  return Effect.scoped(
    Effect.gen(function* () {
      const registration = yield* Effect.acquireRelease(
        Effect.retry(
          Effect.tryPromise(() => serviceRegistration(store, build)),
          { times: 50, schedule: Schedule.spaced(20) }
        ),
        (value) => Effect.promise(() => value.close())
      );
      if (registration.adopted) {
        const { response, health } = yield* Effect.timeout(Effect.tryPromise(async signal => {
          const reply = await fetch(`${registration.owner.endpoint}/api/civic/health`, {
            headers: {
              authorization: `Bearer ${registration.owner.capability}`,
            },
            signal,
          })
          return { response: reply, health: await reply.json() };
        }), '5 seconds');
        if (
          !response.ok ||
          health.nonce !== registration.owner.nonce ||
          health.build !== build ||
          health.protocol !== 1
        )
          throw Error(
            "The registered listener did not authenticate as this CIVIC service."
          );
        return registration.owner;
      }
      const actor = yield* createEffectActor(serverMachine);
      const runs = new Map();
      const closeRuns = () =>
        Promise.all([...runs.values()].map((value) => value.service.close()));
      yield* Effect.addFinalizer(() => Effect.promise(closeRuns));
      const runtime = (project, source, options) => {
        if (stopping) throw Error('Managed host is stopping');
        const key = JSON.stringify([
          project.key,
          project.root,
          project.runtimeEntry,
          options.dataDir,
        ]);
        let value = runs.get(key);
        if (!value) {
          value = { source };
          value.service = runtimeService(
            project,
            () => value.source(),
            options
          );
          runs.set(key, value);
        }
        value.source = source;
        return {
          handle: async input => {
            if (stopping) throw Error('Managed host is stopping');
            const result = await value.service.handle(input);
            if (['mutation', 'identity', 'recover', 'time', 'reset'].includes(input.action))
              presence.broadcast({ type: 'invalidate', run: input.run });
            return result;
          },
          close: value.service.close,
        };
      };
      const stopped = Effect.callback((resume) => {
        const finish = () => {
          if (
            actor.getSnapshot().matches("Stopping") ||
            actor.getSnapshot().matches("Stopped")
          )
            resume(Effect.succeed(undefined));
        };
        const subscription = actor.subscribe(finish);
        finish();
        return Effect.sync(() => subscription.unsubscribe());
      });
      let count = 0,
        stopping = false;
      let viewerGeneration = 0;
      const active = {};
      const presence = clientPresence((remaining) => {
        const type = remaining > count ? "ATTACH" : "LOST";
        count = remaining;
        if (!stopping) actor.send({ type, current: true, remaining });
      });
      const listener = createServer((req, res) => {
        if (req.url === "/api/civic/health") {
          if (
            !equal(
              req.headers.authorization ?? "",
              `Bearer ${registration.owner.capability}`
            )
          ) {
            res.writeHead(401);
            res.end();
            return;
          }
          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              nonce: registration.owner.nonce,
              build,
              protocol: 1,
            })
          );
          return;
        }
        if (!active.generation || stopping) {
          res.writeHead(503, { "retry-after": "1" });
          res.end(stopping ? "Stopping" : "Starting");
          return;
        }
        active.generation.handle(req, res);
      });
      const sockets = new WebSocketServer({
        noServer: true,
        maxPayload: frameLimit,
        handleProtocols: () => "civic-control",
      });
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          stopping = true;
          await Effect.runPromise(sendAndAwait(actor, { type: 'STOP' }));
          await closeRuns();
          await Effect.runPromise(sendAndAwait(actor, { type: 'DRAINED' }));
          presence.close();
          sockets.close();
          try {
            await active.generation?.close();
          } finally {
            listener.closeAllConnections();
            if (listener.listening)
              await promisify(listener.close.bind(listener))();
            await Effect.runPromise(sendAndAwait(actor, { type: 'CLOSED' }));
          }
        })
      );
      listener.on("upgrade", (req, socket, head) => {
        if (req.url !== "/api/civic/control") return;
        void (async () => {
          const generation = viewerGeneration;
          const origin = `http://127.0.0.1:${addressPort(listener)}`;
          const protocols = String(
            req.headers["sec-websocket-protocol"] ?? ""
          ).split(/,\s*/u);
          const loopback = ["127.0.0.1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? ""
          );
          const browser =
            req.headers.origin === origin &&
            req.headers.host === origin.slice(7) &&
            protocols.length === 2 &&
            protocols[0] === "civic-control" &&
            (await Effect.runPromise(
              presence.consume(protocols[1] ?? "", origin)
            ));
          const desktop =
            !req.headers.origin &&
            equal(
              req.headers.authorization ?? "",
              `Bearer ${registration.owner.capability}`
            ) &&
            protocols.length === 1 &&
            protocols[0] === "civic-control";
          if (
            stopping ||
            generation !== viewerGeneration ||
            !active.generation ||
            !loopback ||
            !(browser || desktop)
          ) {
            socket.destroy();
            return;
          }
          sockets.handleUpgrade(req, socket, head, (ws) => presence.attach(ws));
        })().catch(() => socket.destroy());
      });
      yield* Effect.tryPromise(async () => {
        const listening = once(listener, "listening");
        listener.listen(port, "127.0.0.1");
        await listening;
      });
      const endpoint = `http://127.0.0.1:${addressPort(listener)}`;
      yield* Effect.tryPromise(() => registration.publish(endpoint));
      const subscription = actor.subscribe((snapshot) => {
        stopping = snapshot.matches("Stopping") || snapshot.matches("Stopped");
        presence.broadcast({
          type: "status",
          state: JSON.stringify(snapshot.value),
        });
      });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => subscription.unsubscribe())
      );
      const starting = Promise.resolve().then(() =>
        viewer(
          listener,
          {
            issue: (binding) => Effect.runPromise(presence.issue(binding)),
            revoke: () => { viewerGeneration++; presence.revokeTickets() },
          },
          { runtime }
        )
      );
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          // A cancelled start must finish disposal before another host can acquire the store.
          const pending = await starting.catch(() => null);
          if (pending && !active.generation) await pending.close();
        })
      );
      active.generation = yield* Effect.raceFirst(
        Effect.tryPromise(() => starting),
        Effect.andThen(
          stopped,
          Effect.fail(Error("Managed host stopped during startup"))
        )
      );
      yield* sendAndAwait(actor, { type: "READY", clients: count });
      yield* Effect.forkChild(
        Effect.repeat(
          Effect.sync(() => presence.heartbeat()),
          Schedule.spaced(5000)
        )
      );
      yield* stopped;
      stopping = true;
      yield* Effect.promise(closeRuns);
      yield* sendAndAwait(actor, { type: "DRAINED" });
      return registration.owner;
    })
  );
}
