import { RequestHandler, RequestMethod, FileContent } from "eris";
import { Cluster, ClusterIPC, util, consts, IPCCallback } from "../index";

const { InternalIPCEvents } = consts;

export class SyncedRequestHandler extends RequestHandler {
  /**
   * The cluster upc
   */
  public ipc: ClusterIPC;

  /**
   * The time in ms before a request is aborted
   */
  public timeout: number;

  /**
   * @param cluster The cluster using the request handler
   */
  public constructor(cluster: Cluster) {
    super(cluster.client);

    this.timeout = cluster.client.options.requestTimeout ?? 15000;
    this.ipc = cluster.ipc;
  }

  public request(
    method: RequestMethod,
    url: string,
    auth?: boolean,
    body?: RequestBody,
    file?: FileContent,
    _route?: string,
    short?: boolean
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const stackCapture = new Error().stack as string;
      const requestId = util.generateIPCFetchId(InternalIPCEvents.ApiRequest);

      if (file && typeof file.file === "string") {
        file.file = Buffer.from(file.file).toString("base64");
      }

      // Callback for request response
      const callback: IPCCallback = async (data) => {
        if (data.error) {
          const error = new Error(data.error.message);

          error.stack =
            data.error.stack +
            "\n" +
            stackCapture.substring(stackCapture.indexOf("\n") + 1);

          reject(error);
        } else {
          resolve(data.data);
        }
      };

      // Timeout the request
      const timeout = setTimeout(() => {
        reject(new Error(`Request timed out (>${this.timeout}ms) on ${method} ${url}`));
        this.ipc.removeEvent(requestId, callback);
      }, this.timeout);

      // Listen for the request response
      this.ipc.addEvent(requestId, async (data) => {
        callback(data);
        clearTimeout(timeout);
        this.ipc.removeEvent(requestId, callback);
      });

      // Send the request
      process.send?.({
        op: InternalIPCEvents.ApiRequest,
        d: { requestId, method, url, auth, body, file, _route, short }
      });
    });
  }
}

export interface RequestBody {
  [s: string]: unknown;
}
