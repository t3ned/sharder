import {
  Cluster,
  ClusterConfig,
  ClusterQueue,
  ILogger,
  Logger,
  IPCMessage,
  IClusterStrategy,
  IConnectStrategy,
  IReconnectStrategy,
  sharedClusterStrategy,
  orderedConnectStrategy,
  queuedReconnectStrategy,
  consts
} from "../index";

import { TypedEmitter } from "tiny-typed-emitter";
import { Client, ClientOptions } from "eris";
import cluster, { Worker } from "cluster";

const { InternalIPCEvents } = consts;

export class ClusterManager extends TypedEmitter<ClusterManagerEvents> {
  /**
   * The queue for connecting clusters sequentially
   */
  public queue = new ClusterQueue();

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
   * Whether or not to use the synced request handler
   */
  public useSyncedRequestHandler: boolean;

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
   * The total shards to connect
   */
  #shardCount = 0;

  /**
   * The manager's stats
   */
  #stats: ClusterManagerStats;

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
    this.useSyncedRequestHandler = options.useSyncedRequestHandler ?? true;

    this.shardCountOverride = options.shardCountOverride ?? 0;
    this.guildsPerShard = options.guildsPerShard ?? 1500;
    this.firstShardId = options.firstShardId ?? 0;
    this.lastShardId =
      options.lastShardId ??
      (this.shardCountOverride > 0 ? this.shardCountOverride - 1 : 0);

    this.clusterIdOffset = options.clusterIdOffset ?? 0;
    this.clusterTimeout = options.clusterTimeout ?? 5000;
    this.ipcTimeout = options.ipcTimeout ?? 10000;

    this.#stats = {
      clustersIdentified: 0
    };

    // Add default strategies
    this.setClusterStrategy(sharedClusterStrategy());
    this.setConnectStrategy(orderedConnectStrategy());
    this.setReconnectStrategy(queuedReconnectStrategy());
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
   * Gets the config for a cluster by worker id
   * @param id The id of the worker
   */
  public getClusterByWorkerId(id: number): ClusterConfig | undefined {
    return this.#clusterConfigs.find((config) => config.workerId === id);
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
   * Restarts the worker for a cluster
   * @param worker The worker to restart
   * @param code The reason for exiting
   */
  public restartCluster(worker: Worker, code = 0): void {
    void worker, code;
  }

  /**
   * The options for all the clusters held by the manager
   */
  public get clusterConfigs(): ClusterConfig[] {
    return this.#clusterConfigs;
  }

  /**
   * Launches all the clusters
   */
  public launch(): void {
    if (cluster.isPrimary) {
      process.on("uncaughtException", this._handleException.bind(this));
      process.on("unhandledRejection", this._handleRejection.bind(this));
      cluster.on("message", this._handleMessage.bind(this));
      cluster.on("exit", this.restartCluster.bind(this));
      this.queue.on("connectCluster", this._connectCluster.bind(this));

      process.nextTick(async () => {
        this.logger.info("Initializing clusters...");
        cluster.setupPrimary();

        // Run cluster strategy
        this.logger.info(`Clustering using the '${this.clusterStrategy.name}' strategy`);
        await this.clusterStrategy.run(this);

        if (!this.clusterConfigs.length)
          throw new Error("Cluster strategy failed to produce at least 1 clusterer");

        // Wait for all the clusters to identify
        await this._awaitIdentified();
        this.logger.info("Finished identifying clusters");

        // Run connect strategy
        this.logger.info(`Connecting using the '${this.connectStrategy.name}' strategy`);
        await this.connectStrategy.run(this, this.#clusterConfigs);
      });
    } else {
      const cluster = new Cluster(this);
      cluster.spawn();
    }
  }

  /**
   * Sends a message to a cluster
   * @param id The id of the cluster
   * @param message The message to send
   */
  public sendTo(id: number, message: IPCMessage): void {
    const config = this.getCluster(id);
    if (!config || typeof config.workerId === "undefined") return;
    const worker = cluster.workers?.[config.workerId];
    if (worker) worker.send(message);
  }

  /**
   * Sends a message to all the clusters
   * @param message The message to send
   */
  public broadcast(message: IPCMessage): void {
    for (const config of this.#clusterConfigs) {
      this.sendTo(config.id, message);
    }
  }

  /**
   * Fetches the estimated guild count for the client
   */
  public async fetchGuildCount(): Promise<number> {
    const sessionData = await this.restClient.getBotGateway().catch(() => null);
    if (!sessionData) throw new Error("Failed to fetch guild count");
    this.logger.info(`Discord recommended ${sessionData.shards} shards`);
    return sessionData.shards * 1000;
  }

  /**
   * Fetches the number of shards to spawn
   */
  public async fetchShardCount(): Promise<number> {
    const guildCount = await this.fetchGuildCount();
    const shardCount = Math.ceil(guildCount / this.guildsPerShard);
    this.#shardCount = Math.max(this.shardCountOverride, shardCount);
    return this.#shardCount;
  }

  /**
   * A promise which resolves once all the clusters have identified
   */
  private _awaitIdentified(): Promise<void> {
    return new Promise((resolve) => this.once("identified", () => resolve()));
  }

  /**
   * Connects a cluster
   * @param cluster The cluster to connect
   */
  private _connectCluster(cluster: ClusterConfig): void {
    this.sendTo(cluster.id, {
      op: InternalIPCEvents.Connect,
      d: cluster
    });
  }

  /**
   * Handles an unhandled exception
   * @param error The exception
   */
  private _handleException(error: Error): void {
    this.logger.error(error);
  }

  /**
   * Handles unhandled promise rejections
   * @param reason The reason the promise was rejected
   * @param p The promise
   */
  private _handleRejection(reason: Error, p: Promise<any>): void {
    this.logger.error(`Unhandled rejection at Promise: ${p}, reason: ${reason}`);
  }

  /**
   * Handles a message sent by a worker
   * @param worker The worker that sent the message
   * @param message The message
   */
  private async _handleMessage(worker: Worker, message: IPCMessage): Promise<void> {
    const config = this.getClusterByWorkerId(worker.id);
    if (!config) return;

    switch (message.op) {
      case InternalIPCEvents.ClusterReady: {
        setTimeout(() => this.queue.next(), this.clusterTimeout);
        break;
      }
      case InternalIPCEvents.IdentifyCluster: {
        const payload: IdentifyPayload = {
          name: config.name,
          id: config.id,
          firstShardId: config.firstShardId,
          lastShardId: config.lastShardId,
          shardCount: config.shardCount
        };

        this.sendTo(config.id, { op: InternalIPCEvents.Identify, d: payload });

        if (++this.#stats.clustersIdentified === this.#clusterConfigs.length) {
          this.emit("identified", this.#stats.clustersIdentified);
        }

        break;
      }
      case InternalIPCEvents.ApiRequest: {
        try {
          const data = await this.restClient.requestHandler.request(
            message.d.method,
            message.d.url,
            message.d.auth,
            message.d.body,
            message.d.file,
            message.d._route,
            message.d.short
          );

          this.sendTo(config.id, {
            op: message.d.requestId,
            d: {
              data
            }
          });
        } catch (error: any) {
          this.sendTo(config.id, {
            op: message.d.requestId,
            d: {
              error: {
                code: error.code,
                message: error.message,
                stack: error.stack
              }
            }
          });
        }

        break;
      }
    }
  }
}

export type ClusterManagerEvents = {
  identified: (clusters: number) => void;
};

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
   * Whether or not to use the synced request handler
   */
  useSyncedRequestHandler: boolean;

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

export type IdentifyPayload = Omit<ClusterConfig, "workerId">;

export interface ClusterManagerStats {
  clustersIdentified: number;
}
