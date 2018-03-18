local matched = 1
local not_matched = 0
local min_rating = 1
local max_rating = 30
local status_prefix = "status:"
local queues_prefix = "queues:"
local min_queue_prefix = "min-queue:"
local max_queue_prefix = "max-queue:"

local player_id = ARGV[1]
local player_rating = ARGV[2]
local status_key = status_prefix..player_id
local queues_key = queues_prefix..player_id
local min_queue_key = min_queue_prefix..player_id
local max_queue_key = max_queue_prefix..player_id


local remove_player_from_queues = function(id)
  local joined_queues = redis.call("lrange", queues_prefix..id, 0, -1)

  if joined_queues ~= false then
    for index, queue in ipairs(joined_queues) do
      redis.call("lrem", queue, 1, id)
    end
  end
end


local remove_player_state = function(id)
  redis.call("del", min_queue_prefix..id)
  redis.call("del", max_queue_prefix..id)
  redis.call("del", queues_prefix..id)
end


local find_match_or_join = function(queue)
  local match_id = redis.call("rpop", queue)

  if match_id == false then
    redis.call("lpush", queue, player_id)
    redis.call("lpush", queues_key, queue)
    return false
  else
    redis.call("set", status_prefix..match_id, 1)
    redis.call("set", status_key, 1)
    remove_player_from_queues(match_id)
    remove_player_from_queues(player_id)
    remove_player_state(match_id)
    remove_player_state(player_id)
    return match_id
  end
end


local init_player_state = function()
  redis.call("set", status_key, 0)
  redis.call("set", min_queue_key, player_rating)
  redis.call("set", max_queue_key, player_rating)
end


local find_match_retry = function()
  local min_queue = tonumber(redis.call("get", min_queue_key))
  local max_queue = tonumber(redis.call("get", max_queue_key))

  if min_queue > min_rating then
    local match = find_match_or_join(min_queue - 1)

    if match ~= false then
      return match
    else
      redis.call("set", min_queue_key, min_queue - 1)
    end
  end

  if max_queue < max_rating then
    local match = find_match_or_join(max_queue + 1)

    if match ~= false then
      return match
    else
      redis.call("set", max_queue_key, max_queue + 1)
    end
  end
end


local status = tonumber(redis.call("get", status_key))

if status == nil then
  local match = find_match_or_join(player_rating)

  if match == false then
    init_player_state()
    return {false,true}
  else
    return {match,true}
  end
elseif status == not_matched then
  local match = find_match_retry()

  if match == nil then
    return {false,true}
  else
    return {match,true}
  end
elseif status == matched then
  return {false,false}
end
