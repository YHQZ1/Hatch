package handlers

import (
	"sync"
	"time"
)

// ttlCache keeps small values in memory for a while. It is for answers that
// are cheap to ask for again but not worth asking for on every request, such as
// whether a repository has a Dockerfile. It is per process and empty after a
// restart, which costs only the next request.
type ttlCache struct {
	mu    sync.Mutex
	ttl   time.Duration
	max   int
	now   func() time.Time
	items map[string]ttlItem
}

type ttlItem struct {
	value   []byte
	expires time.Time
}

// newTTLCache returns a cache whose entries live for ttl and which holds at
// most max entries.
func newTTLCache(ttl time.Duration, max int) *ttlCache {
	return &ttlCache{ttl: ttl, max: max, now: time.Now, items: make(map[string]ttlItem)}
}

func (c *ttlCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	item, ok := c.items[key]
	if !ok {
		return nil, false
	}
	if !c.now().Before(item.expires) {
		delete(c.items, key)
		return nil, false
	}
	return item.value, true
}

func (c *ttlCache) Set(key string, value []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if _, exists := c.items[key]; !exists && len(c.items) >= c.max {
		c.evict(now)
	}
	c.items[key] = ttlItem{value: value, expires: now.Add(c.ttl)}
}

// evict makes room: it drops what has expired, and if that is not enough, the
// entry closest to expiring.
func (c *ttlCache) evict(now time.Time) {
	var oldestKey string
	var oldest time.Time
	for key, item := range c.items {
		if !now.Before(item.expires) {
			delete(c.items, key)
			continue
		}
		if oldestKey == "" || item.expires.Before(oldest) {
			oldestKey, oldest = key, item.expires
		}
	}
	if len(c.items) >= c.max && oldestKey != "" {
		delete(c.items, oldestKey)
	}
}
