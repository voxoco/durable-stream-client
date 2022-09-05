# Durable Stream Client :electric_plug:

A lightweight client for [Durable Stream](https://github.com/voxoco/durable-stream)

The client

## Installation

```bash
npm install durable-stream-client
```

## Feaures
* Publish messages to a durable stream (to be propagated to other clients subscribed on the same subject)
* Simple reconnect logic
* Queues up messages while disconnected and sends them when reconnected (with a ~2 second timeout)
* Subscribe to messages on a durable stream
* Delete messages from a durable stream
* Get/set the object state (a generic object we can set/get on the durable object)
* Get metadata, get, put, delete objects in R2


## Usage

```js
// Shim the websocket client for node
globalThis.WebSocket = require('websocket').w3cwebsocket;

import DurableStreamClient from 'durable-stream-client'

const client = new DurableStreamClient({
  host: '<worker-name>.voxo.workers.dev', // defaults to localhost:8787
  secure: true, // boolean required (if local set to false)
  apiKey: 'my-api-key', // string required
  subject: 'my-subject', // string required
})

// Initialize the client
await client.init();
```

## Primary Stream Methods

```js
// Get the current sequence number and general stream info
const info = await client.info();
console.log(info);

const msg = {
  test: 'value',
  someData: 'some-data',
}

// Publish a message (can be a string or object)
const res = await client.publish(msg)
// Returns a promise that resolves to the response from the server and includes the message id, sequence number etc..

// Subscribe to messages
// The first arg is the sequence number to start from (0 for all messages from the beginning of the stream)
client.subscribe(10000000019, async (msg, ack) => {
  console.log(`Received message: ${JSON.stringify(msg)}`);
  ack();
  // Be sure to ack all messages!
  // Acknowledging a message will remove it from the queue on the client and server
})

// Unsubscribe from messages
await client.unsubscribe();

// Delete messages in the stream up to a sequence number
await client.delete(10000000019);

// Get the object object state (just a generic object we can set/get on the durable object)
const state = await client.getState();

// Set the object state
await client.putState({ some: 'data' });
```

## R2 Methods

```js
// Head object (get metadata)
const metadata = await client.headObject('/path/to/object.ext');

// Get object
const object = await client.getObject('/path/to/object.ext');
// Write the file to disk
fs.writeFileSync('/local/path/file.ext', object);

// Put object
// Arg 1 = file path in R2
// Arg 2 = local file path to upload

const res = await client.putObject('/path/to/object.ext', '/local/path/file.ext');

// Delete object
const res = await client.deleteObject('/path/to/object.ext');
```

## 

## License

MIT