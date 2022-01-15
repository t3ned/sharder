import type {
  IClusterStrategy,
  IConnectStrategy,
  IReconnectStrategy
} from "../struct/Strategy";

import { ILogger, Logger } from "../struct/Logger";
import type { ClusterConfig } from "./Cluster";
import { Client, ClientOptions } from "eris";
import { EventEmitter } from "events";
import cluster from "cluster";

export class ClusterManager extends EventEmitter {
  /**
   * The rest client used for API requests
   */
  public restClient!: Client;

  /**
   * The logger used by the manager
   */
  public logger: ILogger;

  /**
   * The client structure to use
   */
  public clientBase: typeof Client;

  /**
   * The options passed to the client
   */
  public clientOptions: ClientOptions;

  /**
   * The forced shard count
   */
  public shardCountOverride: number;

  /**
   * The number of guilds that a shard should hold
   */
  public guildsPerShard: number;

  /**
   * The id of the first shard the manager holds
   */
  public firstShardId: number;

  /**
   * The id of the last shard the manager holds
   */
  public lastShardId: number;

  /**
   * The id to add to cluster ids to act as an offset
   */
  public clusterIdOffset: number;

  /**
   * The time in ms to wait before connecting next cluster
   */
  public clusterTimeout: number;

  /**
   * The time in ms to wait before an IPC fetch request aborts
   */
  public ipcTimeout: number;

  /**
   * The strategy to configure the clusters
   */
  public clusterStrategy!: IClusterStrategy;

  /**
   * The strategy to connect the clusters
   */
  public connectStrategy!: IConnectStrategy;

  /**
   * The strategy to reconnect a cluster
   */
  public reconnectStrategy!: IReconnectStrategy;

  /**
   * The token used for connecting to Discord
   */
  public token!: string;

  /**
   * The options for all the clusters held by the manager
   */
  #clusterConfigs: ClusterConfig[] = [];

  /**
   * @param token The token used to login to discord
   * @param options The options for the manager
   */
  public constructor(token: string, options: Partial<ClusterManagerOptions> = {}) {
    super();

    const restClient = new Client(token, { restMode: true, intents: 0 });
    Reflect.defineProperty(this, "restClient", { value: restClient });
    Reflect.defineProperty(this, "token", { value: token });

    this.logger = options.logger ?? new Logger();
    this.clientBase = options.clientBase ?? Client;
    this.clientOptions = options.clientOptions ?? { intents: 0 };

    this.shardCountOverride = options.shardCountOverride ?? 0;
    this.guildsPerShard = options.guildsPerShard ?? 1500;
    this.firstShardId = options.firstShardId ?? 0;
    this.lastShardId =
      options.lastShardId ??
      (this.shardCountOverride > 0 ? this.shardCountOverride - 1 : 0);

    this.clusterIdOffset = options.clusterIdOffset ?? 0;
    this.clusterTimeout = options.clusterTimeout ?? 5000;
    this.ipcTimeout = options.ipcTimeout ?? 10000;
  }

  /**
   * Sets the strategy to use for starting clusters
   * @param strategy The cluster strategy
   */
  public setClusterStrategy(strategy: IClusterStrategy): this {
    this.clusterStrategy = strategy;
    return this;
  }

  /**
   * Sets the strategy to use for connecting clusters
   * @param strategy The connect strategy
   */
  public setConnectStrategy(strategy: IConnectStrategy): this {
    this.connectStrategy = strategy;
    return this;
  }

  /**
   * Sets the strategy to use for reconnecting clusters
   * @param strategy The reconnect strategy
   */
  public setReconnectStrategy(strategy: IReconnectStrategy): this {
    this.reconnectStrategy = strategy;
    return this;
  }

  /**
   * Gets the config for a cluster
   * @param id The id of the cluster
   */
  public getCluster(id: number): ClusterConfig | undefined {
    return this.#clusterConfigs.find((config) => config.id === id);
  }

  /**
   * Sets the config for a cluster
   * @param config The cluster config
   */
  public setCluster(config: AddClusterConfig): this {
    if (this.getCluster(config.id)) throw new Error("Cluster#id must be unique");
    const shardCount = config.lastShardId - config.firstShardId + 1;
    this.#clusterConfigs.push({ ...config, shardCount });
    return this;
  }

  /**
   * Deletes the config for a cluster
   * @param id The id of the cluster
   */
  public deleteCluster(id: number): this {
    const idx = this.#clusterConfigs.findIndex((config) => config.id === id);
    if (idx !== -1) this.#clusterConfigs.splice(idx, 1);
    return this;
  }

  /**
   * Starts the worker for a cluster
   * @param id The id of the cluster
   */
  public startCluster(id: number): ClusterConfig | null {
    const config = this.getCluster(id);
    if (!config) return null;

    const worker = cluster.fork();
    config.workerId = worker.id;

    this.logger.info(`Started cluster ${id}`);
    return config;
  }

  /**
   * Stops the worker for a cluster
   * @param id The id of the cluster
   */
  public stopCluster(id: number): ClusterConfig | null {
    const config = this.getCluster(id);
    if (!config || typeof config.workerId === "undefined") return null;

    const worker = cluster.workers?.[config.workerId];
    if (!worker) return null;

    worker.kill();

    this.logger.info(`Stopped cluster ${id}`);
    return config;
  }

  /**
   * The options for all the clusters held by the manager
   */
  public get clusterConfigs(): ClusterConfig[] {
    return this.#clusterConfigs;
  }
}

export interface ClusterManagerOptions {
  /**
   * The logger used by the manager
   */
  logger: ILogger;

  /**
   * The client structure to use
   */
  clientBase: typeof Client;

  /**
   * The options passed to the client
   */
  clientOptions: ClientOptions;

  /**
   * The forced shard count
   */
  shardCountOverride: number;

  /**
   * The number of guilds that a shard should hold
   */
  guildsPerShard: number;

  /**
   * The id of the first shard the manager holds
   */
  firstShardId: number;

  /**
   * The id of the last shard the manager holds
   */
  lastShardId: number;

  /**
   * The id to add to cluster ids to act as an offset
   */
  clusterIdOffset: number;

  /**
   * The time in ms to wait before connecting next cluster
   */
  clusterTimeout: number;

  /**
   * The time in ms to wait before an IPC fetch request aborts
   */
  ipcTimeout: number;
}

// eslint-disable-next-line prettier/prettier
export type AddClusterConfig = Pick<ClusterConfig, "name" | "id" | "firstShardId" | "lastShardId">;
