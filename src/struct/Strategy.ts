import { ClusterManager, ClusterConfig, util } from "../index";
import os from "os";

export interface IClusterStrategy {
  /**
   * The name of the cluster strategy
   */
  readonly name: string;

  /**
   * Runs the strategy to configure clusters
   * @param manager The manager running the strategy
   */
  run(manager: ClusterManager): Promise<void>;
}

export interface IConnectStrategy {
  /**
   * The name of the connect strategy
   */
  readonly name: string;

  /**
   * Runs the strategy to connect the clusters
   * @param manager The manager running the strategy
   * @param configs The cluster configs to connect
   */
  run(manager: ClusterManager, configs: ClusterConfig[]): Promise<void>;
}

export interface IReconnectStrategy {
  /**
   * The name of the connect strategy
   */
  readonly name: string;

  /**
   * Runs the strategy to reconnect a cluster
   * @param manager The manager running the strategy
   * @param clusterId The id of the cluster that died
   */
  run(manager: ClusterManager, clusterId: number): Promise<void>;
}

/**
 * The shared cluster strategy will assign shards to a single cluster
 */
export const sharedClusterStrategy = (): IClusterStrategy => {
  return {
    name: "shared",
    run: async (manager) => {
      const { clusterIdOffset, firstShardId, lastShardId } = manager;
      await manager.fetchShardCount();

      manager
        .setCluster({
          id: clusterIdOffset,
          firstShardId,
          lastShardId
        })
        .startCluster(clusterIdOffset);
    }
  };
};

/**
 * The balanced cluster strategy will assign shards equally across CPU cores
 */
export const balancedClusterStrategy = (): IClusterStrategy => {
  return {
    name: "balanced",
    run: customClusterStrategy(os.cpus().length).run
  };
};

/**
 * The custom cluster strategy will assign shards across the specified number of clusters
 * @param clusterCount The number of clusters to start
 * @param maxShardsPerCluster The maximum number of shards per cluster
 */
export const customClusterStrategy = (
  clusterCount: number,
  maxShardsPerCluster = 0
): IClusterStrategy => {
  return {
    name: "custom",
    run: async (manager) => {
      const { clusterIdOffset, firstShardId, lastShardId } = manager;
      const shardCount = await manager.fetchShardCount();

      if (maxShardsPerCluster) {
        // Ensure the shard count is not larger than the max shards
        const maxTotalShards = clusterCount * maxShardsPerCluster;
        if (maxTotalShards < shardCount) {
          throw new Error(
            "Invalid `shardsPerCluster` provided. `shardCount` should be >= `clusterCount` * `shardsPerCluster`"
          );
        }
      }

      const shardChunks = util.chunkShards(clusterCount, firstShardId, lastShardId, true);

      for (let i = 0; i < shardChunks.length; i++) {
        const shardChunk = shardChunks[i];

        manager
          .setCluster({
            id: clusterIdOffset + i,
            firstShardId: shardChunk[0],
            lastShardId: shardChunk[shardChunk.length - 1]
          })
          .startCluster(clusterIdOffset + i);
      }
    }
  };
};

/**
 * The ordered connect strategy will connect the clusters in the order they were set
 */
export const orderedConnectStrategy = (): IConnectStrategy => {
  return {
    name: "ordered",
    run: async (manager, clusters) => {
      const callback = (cluster: ClusterConfig) => {
        const { id, shardCount } = cluster;
        manager.logger.info(`[C${id}] Connecting with ${shardCount} shards`);

        // Unload event once all clusters have connected
        if (cluster.id === clusters[clusters.length - 1].id) {
          manager.queue.off("connectCluster", callback);
        }
      };

      manager.queue.on("connectCluster", callback);

      for (const cluster of clusters) {
        // Push the clusters into the queue
        manager.queue.enqueue(cluster);
      }
    }
  };
};

/**
 * The queued reconnect strategy will reconnect the clusters bu adding them to the queue
 */
export const queuedReconnectStrategy = (): IReconnectStrategy => {
  return {
    name: "queued",
    run: async (manager, clusterId) => {
      const cluster = manager.getCluster(clusterId);
      if (cluster) return orderedConnectStrategy().run(manager, [cluster]);
    }
  };
};
