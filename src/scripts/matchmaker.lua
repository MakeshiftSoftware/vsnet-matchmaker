local status_suffix = "-status"
local queues_joined_suffix = "-joined-queues"
local min_queue_suffix = "-min-queue"
local max_queue_suffix = "-max-queue"
local min_rating = 1
local max_rating = 30

local player_id = ARGV[1]
local player_rating = ARGV[2]
local status_key = player_id..status_suffix
local queues_key = player_id..queues_joined_suffix
local min_queue_key = player_id..min_queue_suffix
local max_queue_key = player_id..max_queue_suffix

local remove_player_from_queues = function(id)
  local joined_queues = redis.call("lrange", id..queues_suffix, 0, -1)

  if joined_queues ~= false then
    for index, queue in ipairs(joined_queues) do
      redis.call("lrem", queue, 1, id)
    end
  end
end

local remove_player_state = function(id)
  redis.call("del", id..min_queue_suffix)
  redis.call("del", id..max_queue_suffix)
  redis.call("del", id..queues_joined_suffix)
end

local find_match_or_join = function(queue)
  local match_id = redis.call("rpop", queue)

  if match_id == false then
    redis.call("lpush", queue, player_id)
    redis.call("lpush", queues_key, queue)
    return false
  else
    redis.call("set", match_id..status_suffix, "1")
    redis.call("set", status_key, "1")
    remove_player_from_queues(match_id)
    remove_player_from_queues(player_id)
    remove_player_state(match_id)
    remove_player_state(player_id)
    return match_id
  end
end

-- initialize player state
local init_player_state = function()
  redis.call("set", status_key, "0")
  redis.call("set", min_queue_key, player_rating)
  redis.call("set", max_queue_key, player_rating)
end

local status = redis.call("get", status_key)

if status == false then
  -- first attempt at matchmaking
  local match = find_match_or_join(player_rating)

  if match == false then
    -- match not found, init player state and return false
    init_player_state()
    return {false,true}
  else
    -- match found, return match
    return {match,true}
  end
elseif status == "0" then
  -- this is a retry, broaden the search
  local min_queue = tonumber(redis.call("get", min_queue_key))
  local max_queue = tonumber(redis.call("get", max_queue_key))

  -- attempt to find match in min_queue - 1
  if min_queue > min_rating then
    local match = find_match_or_join(min_queue - 1)

    if match ~= false then
      -- match found, return match
      return {match,true}
    else
      -- no match found, update min_queue
      redis.call("set", min_queue_key, min_queue - 1)
    end
  end

  -- attempt to find match in max_queue + 1
  if max_queue < max_rating then
    local match = find_match_or_join(max_queue + 1)

    if match ~= false then
      -- match found, return match
      return {match,true}
    else
      -- no match found, update max_queue
      redis.call("set", max_queue_key, max_queue + 1)
    end
  end

  -- no match found, return false
  return {false,true}
elseif status == "1" then
  -- player has already been matched, do nothing
  return {false,false}
end
