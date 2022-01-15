import { IPC, IPCMessageOp, IPCMessage, consts, util } from "../index";
import type { JSONCache } from "eris";

const { InternalIPCEvents } = consts;

export class ClusterIPC extends IPC {
  /**
   * The id of the cluster the IPC is serving
   */
  public clusterId = -1;

  /**
   * The time in ms to wait before an IPC fetch request aborts
   */
  public timeout: number;

  /**
   * @param timeout The time in ms to wait before an IPC fetch request aborts
   */
  public constructor(timeout: number) {
    super();

    this.timeout = timeout;
  }

  /**
   * Fetches a cached user
   * @param id The id of the user
   */
  public fetchUser(id: string): Promise<JSONCache | undefined> {
    return this.fetch<JSONCache>(InternalIPCEvents.FetchUser, id);
  }

  /**
   * Fetches a cached guild
   * @param id The id of the guild
   */
  public fetchGuild(id: string): Promise<JSONCache | undefined> {
    return this.fetch<JSONCache>(InternalIPCEvents.FetchGuild, id);
  }

  /**
   * Fetches a cached channel
   * @param id The id of the channel
   */
  public fetchChannel(id: string): Promise<JSONCache | undefined> {
    return this.fetch<JSONCache>(InternalIPCEvents.FetchChannel, id);
  }

  /**
   * Fetches a cached member
   * @param guildId The id of the guild
   * @param id The id of the member
   */
  public fetchMember(guildId: string, id: string): Promise<JSONCache | undefined> {
    return this.fetch<JSONCache>(InternalIPCEvents.FetchMember, guildId, id);
  }

  /**
   * Handles the callback for and timeout for data fetching
   * @param op The message op
   * @param meta The meta data
   */
  public fetch<T = any>(op: IPCMessageOp, ...meta: any[]): Promise<T | undefined> {
    const id = util.generateIPCFetchId(op);

    const fetched = new Promise<T | undefined>((resolve) => {
      const callback = async (data: T | undefined) => {
        this.removeEvent(id, callback);
        resolve(data);
      };

      this.addEvent(id, callback);
      setTimeout(() => callback(undefined), this.timeout);
    });

    const payload: IPCMessage = {
      op,
      d: {
        clusterId: this.clusterId,
        fetchId: id,
        meta
      }
    };

    this.broadcast(payload);

    return fetched;
  }
}
