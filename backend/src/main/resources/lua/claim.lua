-- ARGV[1]=now ms; build key prefixes inside the script.
local now = ARGV[1]

for p = 0, 2 do
  local rr = 'rr:' .. p
  local rrset = 'rrset:' .. p
  local n = redis.call('LLEN', rr)
  for i = 1, n do
    local owner = redis.call('LPOP', rr)
    if not owner then break end
    local qo = 'qo:' .. p .. ':' .. owner
    local ids = redis.call('ZRANGEBYSCORE', qo, '-inf', now, 'LIMIT', 0, 1)
    if #ids > 0 and redis.call('ZREM', qo, ids[1]) == 1 then
      if redis.call('ZCARD', qo) > 0 then
        redis.call('RPUSH', rr, owner)
      else
        redis.call('SREM', rrset, owner)
      end
      return ids[1]
    else
      if redis.call('ZCARD', qo) > 0 then
        redis.call('RPUSH', rr, owner)
      else
        redis.call('SREM', rrset, owner)
      end
    end
  end
end

return nil
