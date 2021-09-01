'use strict';

const { createClient } = require('redis');
const _ = require('lodash');

class RedisDatabase {
  constructor(
    host,
    port,
    password,
    // database: string,
    settings,
  ) {
    this.client = null;
    this.host = host;
    this.port = port;
    this.password = password;
    this.settings = settings;
  }

  async getClient() {
    if (!this.client) {
      return this.connect();
    }

    return this.client;
  }

  isConnected() {
    if (!this.client) {
      return false;
    }

    return this.client.connected;
  }

  async connect() {
    if (this.client) {
      return this.client;
    }

    this.client = createClient(_.extend(this.settings, {
      host: this.host,
      password: this.password,
      port: this.port,
    }));

    return this.client;
  }
}

module.exports = new RedisDatabase(
  process.env.REDIS_HOST,
  parseInt(process.env.REDIS_PORT, 10),
  process.env.REDIS_PASS,
);
