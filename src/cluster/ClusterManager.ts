import type {
  IClusterStrategy,
  IConnectStrategy,
  IReconnectStrategy
} from "../struct/Strategy";

import { ILogger, Logger } from "../struct/Logger";
import { Client, ClientOptions } from "eris";
import { EventEmitter } from "events";

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
