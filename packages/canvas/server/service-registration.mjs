import { randomUUID } from "node:crypto";
import {
  mkdir,
  realpath,
  lstat,
  readFile,
  writeFile,
  unlink,
  rmdir,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

import { Schema } from "effect";

const repair = () =>
  Error(
    "Service ownership is unreadable or busy. Inspect the private service directory before repairing it."
  );
const join = path.join;
// eslint-disable-next-line anti-slop/no-unknown-parameters -- filesystem failures enter through a catch boundary.
const code = (error, expected) =>
  error instanceof Error && "code" in error && error.code === expected;
const ownerSchema = Schema.Struct({
  pid: Schema.Number,
  machine: Schema.String,
  nonce: Schema.String,
  build: Schema.String,
  protocol: Schema.Number,
  capability: Schema.String,
  endpoint: Schema.optional(Schema.String),
});
const adoptedNoop = () => Promise.resolve();
const privateDirectory = (entry, uid) => entry.isDirectory() && entry.mode % 512 === 0o700 && entry.uid === uid;
const dead = (owner) => {
  try { process.kill(owner.pid, 0); return false }
  catch (error) { return code(error, 'ESRCH') }
};
const sameOwner = (registered, previous, build) =>
  registered.nonce === previous.nonce &&
  registered.pid === previous.pid &&
  registered.capability === previous.capability &&
  registered.build === build &&
  /^http:\/\/127\.0\.0\.1:\d+$/u.test(registered.endpoint ?? "");
export async function serviceRegistration(store, build) {
  const root = await realpath(store);
  const directory = join(root, ".review-data", "service");
  await mkdir(join(root, ".review-data"), { recursive: true, mode: 0o700 });
  const parent = await lstat(join(root, ".review-data"));
  if (parent.isSymbolicLink() || !parent.isDirectory()) throw repair();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!privateDirectory(info, process.getuid?.())) throw repair();
  const lock = join(directory, "owner.lock"),
    breaker = join(directory, "breaker.lock"),
    registration = join(directory, "registration.json");
  const read = async (file) => {
    const stat = await lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.mode % 512 !== 0o600 ||
      stat.uid !== info.uid
    )
      throw repair();
    const value = Schema.decodeUnknownSync(ownerSchema)(
      JSON.parse(await readFile(file, "utf8"))
    );
    if (
      !Number.isSafeInteger(value.pid) ||
      value.pid <= 0 ||
      value.machine !== hostname() ||
      !value.nonce ||
      !value.capability ||
      value.protocol !== 1
    )
      throw repair();
    return value;
  };
  const ownerFile = join(lock, "owner.json");
  const nonce = randomUUID();
  const owner = {
    pid: process.pid,
    machine: hostname(),
    nonce,
    build,
    protocol: 1,
    capability: randomUUID(),
  };
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (!code(error, "EEXIST")) throw error;
    const claim = await lstat(lock);
    if (!privateDirectory(claim, info.uid)) throw repair();
    const previous = await read(ownerFile);
    if (!dead(previous)) {
      if (previous.build !== build)
        throw Error("A live incompatible CIVIC service owns this store.", {
          cause: error,
        });
      const registered = await read(registration);
      if (!sameOwner(registered, previous, build)) throw repair();
      return {
        owner: registered,
        adopted: true,
        publish: adoptedNoop,
        close: adoptedNoop,
      };
    }
    await mkdir(breaker, { mode: 0o700 });
    try {
      const current = await read(ownerFile);
      if (current.nonce !== previous.nonce || !dead(current)) throw repair();
      try {
        const registered = await read(registration);
        if (registered.nonce !== current.nonce) throw repair();
        await unlink(registration);
      } catch (missingError) {
        if (!code(missingError, "ENOENT")) throw missingError;
      }
      await unlink(ownerFile);
      await rmdir(lock);
      await mkdir(lock, { mode: 0o700 });
    } finally {
      await rmdir(breaker);
    }
  }
  await writeFile(ownerFile, JSON.stringify(owner), {
    flag: "wx",
    mode: 0o600,
  });
  return {
    owner,
    adopted: false,
    async publish(endpoint) {
      const current = await read(ownerFile);
      if (
        current.nonce !== nonce ||
        !/^http:\/\/127\.0\.0\.1:\d+$/u.test(endpoint)
      )
        throw repair();
      owner.endpoint = endpoint;
      await writeFile(registration, JSON.stringify(owner), {
        flag: "wx",
        mode: 0o600,
      });
    },
    async close() {
      const current = await read(ownerFile);
      if (current.nonce !== nonce) return;
      try {
        const registered = await read(registration);
        if (registered.nonce !== nonce) return;
        await unlink(registration);
      } catch (error) {
        if (!code(error, "ENOENT")) throw error;
      }
      await unlink(ownerFile);
      await rmdir(lock);
    },
  };
}
