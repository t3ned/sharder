import type { IPCMessageOp } from "../ipc/IPC";
import { randomBytes } from "crypto";

/**
 * Generates a unique id used for IPC fetches
 * @param op The IPC op
 */
export const generateIPCFetchId = (op: IPCMessageOp): string => {
  return `ipc.${op}.${randomBytes(16).toString("hex")}`;
};

/**
 * Splits an array into N number of chunks
 * @param chunkCount The number of chunks to create
 * @param array The array to chunk
 */
export const chunkArray = <T = any>(chunkCount: number, array: T[]): T[][] => {
  const chunked: T[][] = [];

  for (let i = chunkCount; i > 0; i--) {
    chunked.push(array.splice(0, Math.ceil(array.length / i)));
  }

  return chunked;
};

/**
 * Splits the shards into evenly spread chunks
 * @param clusterCount The number of clusters
 * @param firstShardId The id of the first shard
 * @param lastShardId The id of the last shard
 * @param discardEmpty Whether or not to discard empty chunks
 */
export const chunkShards = (
  clusterCount: number,
  firstShardId: number,
  lastShardId: number,
  discardEmpty = false
): number[][] => {
  const shards: number[] = [];

  // Fill the shards array with shard Ids from firstShardId to lastShardId
  for (let i = firstShardId; i <= lastShardId; i++) shards.push(i);

  const chunks = chunkArray(clusterCount, shards);
  if (!discardEmpty) return chunks;

  return chunks.filter((chunk) => chunk.length !== 0);
};
