export class Cluster {
  // public up() {}
  // public down() {}
}

export interface ClusterConfig {
  name?: string;
  id: number;
  workerId?: number;
  firstShardId: number;
  lastShardId: number;
  shardCount: number;
}
