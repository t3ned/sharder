import { InternalIPCEvents } from "../util/constants";
import { EventEmitter } from "events";

export class IPC<Callback extends IPCCallback = IPCCallback> extends EventEmitter {
  /**
   * The registered IPC events
   */
  public events = new Map<IPCMessageOp, Callback[]>();

  /**
   * Whether or not the IPC is listening for messages
   */
  public isListening = false;

  /**
   * Adds an event to the IPC
   * @param name The name of the event
   * @param callback The event callback
   */
  public addEvent(name: IPCMessageOp, callback: Callback): this {
    const callbacks = this.events.get(name) ?? [];
    this.events.set(name, [...callbacks, callback]);
    this._listen();
    return this;
  }

  /**
   * Removes an event from the IPC
   * @param name The name of the event
   * @param callback The event callback
   */
  public removeEvent(name: IPCMessageOp, callback: Callback): this {
    const callbacks = this.events.get(name) ?? [];
    const eventCallbacks = callbacks.filter((cb) => cb !== callback);
    this.events.set(name, eventCallbacks);
    return this;
  }

  /**
   * Sends a message to a specific cluster
   * @param clusterId The id of the target cluster
   * @param message The message to send to the cluster
   */
  public sendTo(clusterId: number, message: IPCMessage): void {
    const payload: IPCMessage = {
      op: InternalIPCEvents.SendTo,
      d: {
        clusterId,
        message
      }
    };

    process.send?.(payload);
  }

  /**
   * Sends a message to all clusters
   * @param message The message to send to the clusters
   */
  public broadcast(message: IPCMessage): void {
    const payload: IPCMessage = {
      op: InternalIPCEvents.Broadcast,
      d: message
    };

    process.send?.(payload);
  }

  /**
   * Starts listening for messages
   */
  protected _listen(): void {
    if (this.isListening) return;
    this.isListening = true;

    process.on("message", async (message: IPCMessage) => {
      if (!message || typeof message.op === "undefined") return;
      const callbacks = this.events.get(message.op);
      if (callbacks) await Promise.all(callbacks.map((cb) => cb(message.d)));
    });
  }
}

export type IPCMessageOp = string | number;

export interface IPCMessage<T = any> {
  op: IPCMessageOp;
  d: T;
}

export type IPCCallback<T = any> = (d: T) => Promise<void>;
