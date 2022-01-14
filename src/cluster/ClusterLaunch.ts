import type { ClusterIPC } from "../ipc/ClusterIPC";
import type { Cluster } from "./Cluster";
import type { Client } from "eris";

export abstract class ClusterLaunch<T extends Client = Client> {
  /**
   * @param cluster The client assigned to the cluster
   */
  public constructor(public cluster: Cluster<T>) {}

  /**
   * A method called before the cluster connects
   */
  public abstract init(): void;

  /**
   * A method called after the cluster is finished connecting
   */
  public abstract launch(): void;

  /**
   * The client assigned to the cluster
   */
  public get client(): T {
    return this.cluster.client;
  }

  /**
   * The IPC assigned to the cluster
   */
  public get ipc(): ClusterIPC {
    return this.cluster.ipc;
  }
}
