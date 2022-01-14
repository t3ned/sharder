import { IPC, IPCMessageOp, IPCMessage } from "./IPC";
import { generateIPCFetchId } from "../util/functions";

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
   * Handles the callback for and timeout for data fetching
   * @param op The message op
   * @param meta The meta data
   */
  public fetch<T = any>(op: IPCMessageOp, ...meta: any[]): Promise<T | undefined> {
    const id = generateIPCFetchId(op);

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
