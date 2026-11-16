import { machineFromJSON } from "xstate";

export const deadlines = {
  boot: 60_000,
  firstClient: 60_000,
  ping: 5000,
  clientExpiry: 15_000,
  grace: 10_000,
  drain: 30_000,
  close: 5000,
};

export function serverLifecycle(time = deadlines) {
  return machineFromJSON(
    {
      id: "server",
      initial: "Starting",
      context: {},
      schemas: {
        events: Object.fromEntries(
          [
            "READY",
            "ATTACH",
            "LOST",
            "STOP",
            "FAILED",
            "DRAINED",
            "CLOSED",
          ].map((type) => [type, {}])
        ),
      },
      states: {
        Starting: {
          after: { [time.boot]: { target: "Stopping" } },
          on: {
            READY: [
              { target: "Serving", guard: { type: "clients" } },
              { target: "AwaitingClient" },
            ],
            STOP: { target: "Stopping" },
            FAILED: { target: "Stopping" },
          },
        },
        AwaitingClient: {
          after: { [time.firstClient]: { target: "Stopping" } },
          on: { ATTACH: { target: "Serving" }, STOP: { target: "Stopping" } },
        },
        Serving: {
          on: {
            ATTACH: {},
            LOST: { target: "Waiting", guard: { type: "lastClient" } },
            STOP: { target: "Stopping" },
          },
        },
        Waiting: {
          after: { [time.grace]: { target: "Stopping" } },
          on: { ATTACH: { target: "Serving" }, STOP: { target: "Stopping" } },
        },
        Stopping: {
          initial: "Draining",
          states: {
            Draining: {
              after: { [time.drain]: { target: "Closing" } },
              on: { DRAINED: { target: "Closing" } },
            },
            Closing: { after: { [time.close]: { target: "#server.Stopped" } } },
          },
          on: { CLOSED: { target: "Stopped" } },
        },
        Stopped: { type: "final" },
      },
    },
    {
      guards: {
        clients: ({ event }) => event.clients > 0,
        lastClient: ({ event }) =>
          event.current === true && event.remaining === 0,
      },
    }
  );
}

export const serverMachine = serverLifecycle();
