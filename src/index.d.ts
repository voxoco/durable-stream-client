declare module 'durable-stream-client' {
  export default class DurableStreamClient {
    constructor(obj: {host: string, secure: boolean, apiKey: string, subject: string});
    init(): Promise<any>;
    publish(msg: any): Promise<any>;
    info(): Promise<any>;
    subscribe(startSequence: number, doHandle: any): Promise<any>;
    unsubscribe(): Promise<any>;
    deleteMessages(sequence: number): Promise<any>;
    getState(): Promise<any>;
    putState(state: Object): Promise<any>;
    headObject(key: string): Promise<any>;
    getObject(key: string): Promise<any>;
    putObject(key: string, file: string): Promise<any>;
  }
}