import {
  ClusterManager,
  ClusterIPC,
  IdentifyPayload,
  consts,
  SyncedRequestHandler
} from "../index";
import type { Client, ClientOptions } from "eris";
import cluster from "cluster";

const { InternalIPCEvents } = consts;

export class Cluster<T extends Client = Client> {
  /**
   * The manager controlling the cluster
   */
  public manager!: ClusterManager;

  /**
   * The Eris.Client instance
   */
  public client!: T;

  /**
   * The cluster ipc
   */
  public ipc: ClusterIPC;

  /**
   * The id of the cluster
   */
  public id = -1;

  /**
   * The status of the cluster
   */
  public status: ClusterStatus = "IDLING";

  /**
   * The name of the cluster
   */
  public name?: string;

  /**
   * The first shard of the cluster
   */
  public firstShardId!: number;

  /**
   * The last shard of the cluster
   */
  public lastShardId!: number;

  /**
   * The total shard count for all clusters
   */
  public shardCount!: number;

  /**
   * The cluster's total guilds
   */
  public guilds = 0;

  /**
   * The cluster's total users
   */
  public users = 0;

  /**
   * The cluster's total channels
   */
  public channels = 0;

  /**
   * The cluster's total voice connections
   */
  public voiceConnections = 0;

  /**
   * @param manager The manager controlling the cluster
   */
  public constructor(manager: ClusterManager) {
    Reflect.defineProperty(this, "manager", { value: manager });
    this.ipc = new ClusterIPC(manager.ipcTimeout);
  }

  /**
   * Spawns the cluster
   */
  public async spawn(): Promise<void> {
    process.on("uncaughtException", this._handleException.bind(this));
    process.on("unhandledRejection", this._handleRejection.bind(this));

    // Identify cluster
    await this._identify();
    if (this.id === -1) return;

    const { firstShardId, lastShardId } = this;
    const { clientOptions, clientBase, useSyncedRequestHandler, token, logger } =
      this.manager;

    this.ipc.clusterId = this.id;
    this.status = "IDENTIFIED";

    const options: ClientOptions = {
      ...clientOptions,
      autoreconnect: true,
      firstShardID: this.firstShardId,
      lastShardID: this.lastShardId,
      maxShards: this.manager.shardCount
    };

    // Initialise client
    const client = new clientBase(token, options);
    Reflect.defineProperty(this, "client", { value: client });
    Reflect.defineProperty(this.client, "cluster", { value: this });

    if (useSyncedRequestHandler) client.requestHandler = new SyncedRequestHandler(this);

    client.on("connect", (id) => {
      logger.info(`[C${this.id}] Shard ${id} established a connection`);
    });

    client.on("shardReady", (id) => {
      if (id === firstShardId) this.status = "CONNECTING";
      logger.info(`[C${this.id}] Shard ${id} is ready`);
    });

    client.on("ready", () => {
      this.status = "READY";
      logger.info(`[C${this.id}] Shards ${firstShardId} - ${lastShardId} are ready`);
    });

    client.once("ready", () => {
      process.send?.({
        op: InternalIPCEvents.ClusterReady,
        d: {}
      });
    });

    client.on("shardDisconnect", (_, id) => {
      logger.error(`[C${this.id}] Shard ${id} disconnected`);

      if (this.isDead) {
        this.status = "DEAD";
        logger.error(`[C${this.id}] All shards died`);
      }
    });

    client.on("shardResume", (id) => {
      if (this.isDead) this.status = "CONNECTING";
      logger.info(`[C${this.id}] Shard ${id} resumed`);
    });

    client.on("error", (error, id) => {
      logger.error(`[C${this.id}] Shard ${id ?? "unknown"} error: ${error}`);
    });

    client.on("warn", (message, id) => {
      logger.warn(`[C${this.id}] Shard ${id ?? "unknown"} warning: ${message}`);
    });

    this.ipc.addEvent(InternalIPCEvents.FetchUser, async (data) => {
      const value = this.client.users.get(data.meta[0]);

      if (value) {
        this.ipc.sendTo(data.clusterId, {
          op: data.fetchId,
          d: value
        });
      }
    });

    this.ipc.addEvent(InternalIPCEvents.FetchGuild, async (data) => {
      const value = this.client.guilds.get(data.meta[0]);

      if (value) {
        this.ipc.sendTo(data.clusterId, {
          op: data.fetchId,
          d: value
        });
      }
    });

    this.ipc.addEvent(InternalIPCEvents.FetchChannel, async (data) => {
      const value = this.client.getChannel(data.meta[0]);

      if (value) {
        this.ipc.sendTo(data.clusterId, {
          op: data.fetchId,
          d: value
        });
      }
    });

    this.ipc.addEvent(InternalIPCEvents.FetchMember, async (data) => {
      const guild = this.client.guilds.get(data.meta[0]);
      const value = guild?.members.get(data.meta[1]);

      if (value) {
        this.ipc.sendTo(data.clusterId, {
          op: data.fetchId,
          d: value
        });
      }
    });

    this.ipc.addEvent(InternalIPCEvents.Connect, this.connect.bind(this));
  }

  /**
   * Connects all the shards in the cluster
   */
  public connect(): Promise<void> {
    return this.client.connect();
  }

  /**
   * Checks whether or not the cluster is dead
   */
  public get isDead(): boolean {
    return this.client.shards.every((shard) => shard.status === "disconnected");
  }

  /**
   * Attempts to identify the cluster
   */
  private _identify(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000);

      const callback = async (payload: IdentifyPayload) => {
        this.name = payload.name;
        this.id = payload.id;
        this.firstShardId = payload.firstShardId;
        this.lastShardId = payload.lastShardId;
        this.shardCount = payload.shardCount;

        this.ipc.removeEvent(InternalIPCEvents.Identify, callback);
        clearTimeout(timeout);
        resolve(true);
      };

      this.ipc.addEvent(InternalIPCEvents.Identify, callback);

      process.send?.({
        op: InternalIPCEvents.IdentifyCluster,
        d: {
          workerId: cluster.worker?.id
        }
      });
    });
  }

  /**
   * Handles an unhandled exception
   * @param error The exception
   */
  private _handleException(error: Error): void {
    this.manager.logger.error(`[C${this.id}] ${error}`);
  }

  /**
   * Handles unhandled promise rejections
   * @param reason The reason the promise was rejected
   * @param p The promise
   */
  private _handleRejection(reason: Error, p: Promise<any>): void {
    this.manager.logger.error(
      `[C${this.id}] Unhandled rejection at Promise: ${p}, reason: ${reason}`
    );
  }
}

export interface ClusterConfig {
  name?: string;
  id: number;
  workerId?: number;
  firstShardId: number;
  lastShardId: number;
  shardCount: number;
}

export type ClusterStatus = "IDLING" | "IDENTIFIED" | "CONNECTING" | "READY" | "DEAD";

declare module "eris" {
  export interface Client {
    readonly cluster: Cluster;
  }
}
