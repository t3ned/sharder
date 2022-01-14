import type { IPCMessageOp } from "../ipc/IPC";
import { randomBytes } from "crypto";

/**
 * Generates a unique id used for IPC fetches
 * @param op The IPC op
 */
export const generateIPCFetchId = (op: IPCMessageOp): string => {
  return `ipc.${op}.${randomBytes(8).toString("hex")}`;
};
