package stream

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Channel is the Postgres NOTIFY channel that says "something happened to this
// deployment": the payload is its id. Triggers send it when a log line is added
// or a status changes (migration 000014).
const Channel = "deployment_events"

// reconnectDelay is how long the Broker waits before listening again after its
// connection fails.
const reconnectDelay = time.Second

// Broker holds one Postgres connection that LISTENs for deployment events and
// wakes whoever is watching the deployment concerned. A wake-up carries no
// data: the watcher reads what it missed from the tables. So a lost
// notification cannot lose a line, and watchers also re-check now and then.
type Broker struct {
	pool *pgxpool.Pool

	mu   sync.Mutex
	subs map[uuid.UUID]map[*subscription]struct{}
}

type subscription struct {
	wake chan struct{}
}

func NewBroker(pool *pgxpool.Pool) *Broker {
	return &Broker{pool: pool, subs: make(map[uuid.UUID]map[*subscription]struct{})}
}

// Subscribe returns a channel that receives a value whenever the deployment
// has news (at most one is pending, so a slow watcher is not flooded), and a
// function that ends the subscription.
func (b *Broker) Subscribe(id uuid.UUID) (<-chan struct{}, func()) {
	sub := &subscription{wake: make(chan struct{}, 1)}
	b.mu.Lock()
	if b.subs[id] == nil {
		b.subs[id] = make(map[*subscription]struct{})
	}
	b.subs[id][sub] = struct{}{}
	b.mu.Unlock()

	return sub.wake, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subs[id], sub)
		if len(b.subs[id]) == 0 {
			delete(b.subs, id)
		}
	}
}

// Run listens until ctx is canceled, reconnecting when the connection drops.
// After a reconnect every watcher is woken, since it may have missed events.
func (b *Broker) Run(ctx context.Context) error {
	for {
		err := b.listen(ctx)
		if ctx.Err() != nil {
			return nil
		}
		slog.Warn("deployment event listener lost its connection; reconnecting", "error", err)
		b.wakeAll()
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(reconnectDelay):
		}
	}
}

func (b *Broker) listen(ctx context.Context) error {
	conn, err := b.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN "+pgx.Identifier{Channel}.Sanitize()); err != nil {
		return err
	}
	// Anything that happened before LISTEN took effect was not heard.
	b.wakeAll()

	for {
		n, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}
		id, err := uuid.Parse(n.Payload)
		if err != nil {
			continue
		}
		b.wake(id)
	}
}

func (b *Broker) wake(id uuid.UUID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for sub := range b.subs[id] {
		select {
		case sub.wake <- struct{}{}:
		default: // a wake-up is already waiting
		}
	}
}

func (b *Broker) wakeAll() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, subs := range b.subs {
		for sub := range subs {
			select {
			case sub.wake <- struct{}{}:
			default:
			}
		}
	}
}
