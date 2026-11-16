import { randomUUID } from "node:crypto";

import { Clock, Effect } from "effect";

export const frameLimit = 16 * 1024;
const hostTime = () => Effect.runSync(Clock.currentTimeMillis);
export function clientPresence(changed, readTime = hostTime) {
  const tickets = new Map();
  const clients = new Map();
  return {
    revokeTickets() {
      tickets.clear();
    },
    issue: (binding) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        for (const [ticket, value] of tickets)
          if (value.expires <= now) tickets.delete(ticket);
        if (tickets.size >= 256)
          throw Error("Too many pending presence tickets");
        const ticket = randomUUID();
        tickets.set(ticket, { expires: now + 10_000, binding });
        return ticket;
      }),
    consume: (ticket, binding) =>
      Effect.gen(function* () {
        const value = tickets.get(ticket);
        tickets.delete(ticket);
        return (
          !!value &&
          value.binding === binding &&
          value.expires > (yield* Clock.currentTimeMillis)
        );
      }),
    attach(socket) {
      const id = randomUUID(),
        generation = randomUUID();
      const queue = [];
      const client = { generation, socket, seen: readTime(), queue, sending: false };
      clients.set(id, client);
      changed(clients.size);
      const release = () => {
        if (clients.get(id)?.generation === generation) {
          clients.delete(id);
          changed(clients.size);
        }
      };
      socket.on("close", release);
      socket.on("error", release);
      socket.on("pong", () => {
        client.seen = readTime();
      });
      socket.on("message", () => {
        socket.close(1008, "Unexpected control message");
        release();
      });
      return { id, generation };
    },
    heartbeat() {
      for (const [id, client] of clients) {
        if (readTime() - client.seen < 15_000) {
          client.socket.ping();
        } else {
          clients.delete(id);
          client.socket.terminate();
          changed(clients.size);
        }
      }
    },
    broadcast(event) {
      const message = JSON.stringify(event);
      if (Buffer.byteLength(message) > frameLimit)
        throw Error("Control frame exceeds limit");
      for (const [id, client] of clients) {
        if (client.queue.length >= 256) {
          clients.delete(id);
          client.socket.close(1013, "Resync required");
          changed(clients.size);
          continue;
        }
        client.queue.push(message);
        const flush = () => {
          const next = client.queue.shift();
          if (!next) {
            client.sending = false;
            return;
          }
          client.sending = true;
          // eslint-disable-next-line promise/prefer-await-to-callbacks -- ws completion bounds the application queue.
          client.socket.send(next, (error) => {
            if (error) client.socket.terminate();
            else flush();
          });
        };
        if (!client.sending) flush();
      }
    },
    close() {
      tickets.clear();
      for (const client of clients.values()) client.socket.terminate();
      clients.clear();
      changed(0);
    },
  };
}
