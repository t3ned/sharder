import type { ClusterManager, IdentifyPayload } from "./ClusterManager";
import { ClusterIPC } from "../ipc/ClusterIPC";
import type { Client } from "eris";
import { InternalIPCEvents } from "../util/constants";
import cluster from "cluster";

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
   * The total shard count for the cluster
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

  public async spawn(): Promise<void> {
    process.on("uncaughtException", this._handleException.bind(this));
    process.on("unhandledRejection", this._handleRejection.bind(this));

    // Identify cluster
    await this._identify();
    if (this.id === -1) return;

    console.log(this);
  }

  // public up() {}
  // public down() {}

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

export type ClusterStatus = "IDLING" | "WAITING" | "CONNECTING" | "READT" | "DEAD";
