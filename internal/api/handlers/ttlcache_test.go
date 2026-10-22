package handlers

import (
	"testing"
	"time"
)

func TestTTLCacheExpires(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	c := newTTLCache(10*time.Minute, 10)
	c.now = func() time.Time { return now }

	if _, ok := c.Get("a"); ok {
		t.Fatal("an empty cache returned a value")
	}
	c.Set("a", []byte("1"))
	if v, ok := c.Get("a"); !ok || string(v) != "1" {
		t.Fatalf("Get = %q, %v", v, ok)
	}
	now = now.Add(9*time.Minute + 59*time.Second)
	if _, ok := c.Get("a"); !ok {
		t.Fatal("expired too early")
	}
	now = now.Add(2 * time.Second)
	if _, ok := c.Get("a"); ok {
		t.Fatal("did not expire")
	}
	if len(c.items) != 0 {
		t.Fatal("an expired entry was kept")
	}
}

func TestTTLCacheIsBounded(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	c := newTTLCache(time.Hour, 3)
	c.now = func() time.Time { return now }

	for _, key := range []string{"a", "b", "c"} {
		c.Set(key, []byte(key))
		now = now.Add(time.Minute) // each expires a minute after the one before
	}
	c.Set("d", []byte("d"))

	if len(c.items) != 3 {
		t.Fatalf("holds %d entries, want 3", len(c.items))
	}
	if _, ok := c.Get("a"); ok {
		t.Error("the entry closest to expiring was kept")
	}
	for _, key := range []string{"b", "c", "d"} {
		if _, ok := c.Get(key); !ok {
			t.Errorf("%q was dropped", key)
		}
	}
	// Replacing a key never makes room by dropping another.
	c.Set("b", []byte("b2"))
	if len(c.items) != 3 {
		t.Fatalf("replacing a key changed the size to %d", len(c.items))
	}
}

func TestTTLCacheDropsExpiredEntriesBeforeLiveOnes(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	c := newTTLCache(time.Minute, 2)
	c.now = func() time.Time { return now }
	c.Set("old", []byte("1"))
	now = now.Add(2 * time.Minute)
	c.Set("live", []byte("2"))
	c.Set("new", []byte("3"))
	if _, ok := c.Get("live"); !ok {
		t.Error("a live entry was dropped while an expired one was available")
	}
}
