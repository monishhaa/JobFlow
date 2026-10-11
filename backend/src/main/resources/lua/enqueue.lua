-- KEYS[1]=qo key, KEYS[2]=rr list, KEYS[3]=rrset; ARGV: jobId, score, owner, mode ("set" or "nx")
local mode = ARGV[4]
local added
if mode == 'nx' then
  added = redis.call('ZADD', KEYS[1], 'NX', ARGV[2], ARGV[1])
else
  added = redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
end

if redis.call('SADD', KEYS[3], ARGV[3]) == 1 then
  redis.call('RPUSH', KEYS[2], ARGV[3])
end

return added
