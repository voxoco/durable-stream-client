"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
class DurableStreamClient {
    constructor(obj) {
        // Sanity check the api key
        if (!obj.apiKey)
            throw new Error('No apiKey exists');
        this.host = obj.host;
        // Base url for R2
        this.apiKey = obj.apiKey;
        this.r2Url = `${obj.secure ? 'https' : 'http'}://${obj.host}/r2`;
        // Set the ws connection url
        this.wsUrl = `${obj.secure ? 'wss' : 'ws'}://${obj.host}/stream/${obj.subject}?apiKey=${obj.apiKey}`;
        this.ws = new WebSocket(this.wsUrl);
        // Storing messages we are waiting for a response to
        this.waitingOperations = {};
        // Message id counter and unique client id
        const rand = Math.random();
        this.cMsgId = rand;
        this.clientId = rand;
        // Listener for messages being broadcasted from the server
        this.listener = {};
        // Some state variables
        this.isConnected = false;
        this.reconnects = -1;
        this.lastSequence = 0;
    }
    async init() {
        while (true) {
            this.isConnected = false;
            // Break out if we are connected
            if (this.ws.readyState === this.ws.OPEN) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.reconnects++;
                this.isConnected = true;
                console.log(`Connected to ${this.wsUrl} with ${this.reconnects} reconnects`);
                // Re-establish listener if we have one
                if (this.listener.doHandle) {
                    console.log(`Re-establishing listener at sequence ${this.lastSequence}`);
                    this.subscribe(this.lastSequence, this.listener.doHandle);
                }
                break;
            }
            // Reconnect if we are disconnected
            if (this.ws.readyState === this.ws.CLOSED || this.ws.readyState === this.ws.CLOSING) {
                console.log(`Attempting websocket connection to: ${this.host}`);
                this.ws = new WebSocket(this.wsUrl);
            }
            // Run this function until we are connected
            if (this.ws.readyState === this.ws.CONNECTING) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        // Setup listeners
        await this.setupListeners();
    }
    // Setup ws client listeners
    async setupListeners() {
        const closeHandler = async () => {
            console.log('Session closed');
            await this.init();
        };
        this.ws.addEventListener("close", closeHandler);
        this.ws.addEventListener("error", closeHandler);
        // Listen for messages
        this.ws.addEventListener('message', async (msg) => {
            const json = JSON.parse(msg.data);
            // Message from the server we should be subscribed to
            if (json.pub) {
                delete json.pub;
                this.listener.doHandle(json, async () => {
                    this.lastSequence = json.sequence;
                    this.ws.send(JSON.stringify(json));
                });
                return;
            }
            // This must be a message from us to the server we are waiting for a response to
            if (json.cMsgId) {
                this.waitingOperations[json.cMsgId].resolveMe(json);
                delete this.waitingOperations[json.cMsgId];
                return;
            }
            // Message from the server we need to respond to
            if (json.sMsgId) {
                this.ws.send(JSON.stringify(json));
                return;
            }
        });
    }
    // Send a message to the websocket waiting for a response
    async publish(msg) {
        // Check can send
        if (!await this.canSend())
            return { error: 'Could not send message' };
        return new Promise((resolve) => {
            ++this.cMsgId;
            this.waitingOperations[this.cMsgId] = { resolveMe: resolve, data: msg, cMsgId: this.cMsgId, clientId: this.clientId };
            this.ws.send(JSON.stringify({ data: msg, cMsgId: this.cMsgId, clientId: this.clientId }));
        });
    }
    // Check if we are able to send a message
    async canSend() {
        let tries = 0;
        while (!this.isConnected) {
            await new Promise(resolve => setTimeout(resolve, 500));
            tries++;
            console.log(`Waiting for connection... Trying ${tries} out of 20 (2 seconds)`);
            if (tries > 20)
                break;
        }
        // If we have used up all our tries, return false
        return tries < 20;
    }
    // Get info about the stream
    async info() {
        return await this.publish({ cmd: 'getStreamInfo' });
    }
    // Used for setting up a listener
    async subscribe(startSequence, doHandle) {
        this.publish({ cmd: 'subscribe', startSequence });
        this.lastSequence = startSequence;
        this.listener = { doHandle };
    }
    // Used to tear down a listener
    async unsubscribe() {
        await this.publish({ cmd: 'unsubscribe' });
        this.listener = {};
    }
    // Delete messages up to a certain sequence number
    async deleteMessages(sequence) {
        await this.publish({ cmd: 'deleteMessages', sequence });
    }
    // Get the current state object
    async getState() {
        return await this.publish({ cmd: 'getState' });
    }
    // Put the current state object
    async putState(state) {
        return await this.publish({ cmd: 'putState', state });
    }
    // Head object from R2
    async headObject(key = '') {
        try {
            const res = await axios_1.default.head(`${this.r2Url}/${key}?apiKey=${this.apiKey}`);
            return res.data;
        }
        catch (err) {
            return err;
        }
    }
    // Get object from R2
    async getObject(key) {
        try {
            const res = await axios_1.default.get(`${this.r2Url}/${key}?apiKey=${this.apiKey}`, { responseType: 'arraybuffer' });
            return res.data;
        }
        catch (err) {
            return err;
        }
    }
    // Put object to R2
    async putObject(key, file) {
        try {
            const res = await axios_1.default.post(`${this.r2Url}/${key}?apiKey=${this.apiKey}`, fs.createReadStream(file), {
                maxBodyLength: Infinity, maxContentLength: Infinity
            });
            return res.data;
        }
        catch (err) {
            return err;
        }
    }
    // Delete object from R2
    async deleteObject(key) {
        try {
            const res = await axios_1.default.delete(`${this.r2Url}/${key}?apiKey=${this.apiKey}`);
            return res.data;
        }
        catch (err) {
            return err;
        }
    }
}
exports.default = DurableStreamClient;
