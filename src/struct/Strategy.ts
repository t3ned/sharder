import type { ClusterManager } from "../cluster/ClusterManager";

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
   */
  run(manager: ClusterManager): Promise<void>;
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
