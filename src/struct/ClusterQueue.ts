import { TypedEmitter } from "tiny-typed-emitter";
import type { ClusterConfig } from "../index";

export class ClusterQueue extends TypedEmitter<ClusterQueueEvents> {
  /**
   * The clusters currently in the queue
   */
  public clusters: ClusterConfig[] = [];

  /**
   * Whether or not a cluster is being processed
   */
  public isProcessing = false;

  /**
   * Adds a cluster into the queue
   * @param cluster The cluster to queue
   */
  public enqueue(cluster: ClusterConfig): void {
    this.clusters.push(cluster);
    if (!this.isProcessing) this.process();
  }

  /**
   * Processes the next cluster
   */
  public async process(): Promise<void> {
    this.isProcessing = true;
    const cluster = this.clusters.shift();

    if (!cluster) {
      this.isProcessing = false;
      if (!this.clusters.length) return;
      return this.process();
    }

    const connectNext = new Promise((resolve) => {
      this.once("next", () => resolve(true));
    });

    this.emit("connectCluster", cluster);
    await connectNext;

    this.isProcessing = false;
    this.process();
  }

  /**
   * Tells the queue a cluster is connected
   */
  public next(): void {
    this.emit("next");
  }

  /**
   * Clears the queue
   */
  public clear(): void {
    this.clusters.length = 0;
  }
}

export type ClusterQueueEvents = {
  connectCluster: (clusterOptions: ClusterConfig) => void;
  next: () => void;
};
