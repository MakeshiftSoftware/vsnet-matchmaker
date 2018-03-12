const Redis = require('ioredis');

class StoreClient {
  constructor(url) {
    this.r = new Redis(url);
  }

  close() {
    return this.r.close();
  }

  get(key) {
    return this.r.get(key);
  }

  mget(keys) {
    return this.r.mget(keys);
  }

  set(key, value) {
    return this.r.set(key, value);
  }

  mset(pairs) {
    return this.r.mset(pairs);
  }

  getset(key, value) {
    return this.r.getset(key, value);
  }

  del(key) {
    return this.r.del(key);
  }

  hdel(key, field) {
    return this.r.hdel(key, field);
  }

  getlist(key) {
    return this.r.lrange(key, 0, -1);
  }

  exists(key) {
    return this.r.exists(key);
  }

  hexists(key, field) {
    return this.r.hexists(key, field);
  }

  llen(key) {
    return this.r.llen(key);
  }

  /**
   * Remove entry from list by value.
   * Direction to search determined by dir.
   * By default, search starts from right side.
   *
   * @param {String} key - The list key
   * @param {String} value - The value to remove
   * @param {Number} dir - The direction to search in
   */
  remove(key, value, dir) {
    dir = dir || -1;
    return this.r.lrem(key, dir, value);
  }

  push(key, value) {
    return this.r.lpush(key, value);
  }

  rpush(key, value) {
    return this.r.rpush(key, value);
  }

  pop(key) {
    return this.r.rpop(key);
  }

  lpop(key) {
    return this.r.lpop(key);
  }

  hset(key, field, value) {
    return this.r.hset(key, field, value);
  }

  hget(key, field) {
    return this.r.hget(key, field);
  }

  incr(key) {
    return this.r.incr(key);
  }

  incrby(key, value) {
    return this.r.incrby(key, value);
  }

  incrbyfloat(key, value) {
    return this.r.incrbyfloat(key, value);
  }

  hincr(key, field) {
    return this.r.hincrby(key, field, 1);
  }

  hincrby(key, field, value) {
    return this.r.hincrby(key, field, value);
  }

  hincrbyfloat(key, field, value) {
    return this.hincrbyfloat(key, field, value);
  }

  decr(key) {
    return this.r.decr(key);
  }

  decrby(key, value) {
    return this.r.decrby(key, value);
  }

  sadd(key, arr) {
    return this.r.sadd(key, arr);
  }

  srem(key, member) {
    return this.r.srem(key, member);
  }

  hlen(key) {
    return this.r.hlen(key);
  }

  hkeys(key) {
    return this.r.hkeys(key);
  }

  hvals(key) {
    return this.r.hvals(key);
  }

  hmget(key, field) {
    return this.r.hmget(key, field);
  }

  hmset(key, pairs) {
    return this.hmset(key, pairs);
  }

  hgetall(key) {
    return this.r.hgetall(key);
  }

  setop(key, value) {
    return ['set', key, value];
  }

  hsetop(key, field, value) {
    return ['hset', key, field, value];
  }

  hmsetop(key, values) {
    return ['hmset', key, values];
  }

  lpushop(key, value) {
    return ['lpush', key, value];
  }

  delop(key) {
    return ['del', key];
  }

  hsetbatch(key, values) {
    const actions = [];

    values.forEach((value, i) => {
      actions.push(['hset', key, i, value]);
    });

    return this.r.multi(actions).exec();
  }

  batch(actions) {
    return this.r.multi(actions).exec();
  }

  dbsize() {
    return this.r.dbsize();
  }

  defineCommand(name, script) {
    this.r.defineCommand(name, {
      lua: script,
      numberOfKeys: 0
    });
  }
}

module.exports = StoreClient;
